import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { db, isFirebaseConfigured } from './firebaseConfig';
import { ref, onValue, set, remove, push } from 'firebase/database';
import { createProcessingKey, getDisplayChars, cn } from './utils';
import { Play, Square, Trash2, Users, Settings, Sparkles, LogIn, CheckCircle2, Clock, AlertTriangle, Plus, ChevronLeft, Lock, LogOut, List, Check, XCircle, Save } from 'lucide-react';

// --- TYPES ---
interface QuestionData {
  letter: string;
  answer: string;
  question: string;
  intersectIndex: number;
}

interface GameState {
  id: string;
  title: string;
  description?: string;
  status: 'waiting' | 'playing' | 'ended';
  mainKeyword: string;
  processingKey: string;
  questions: QuestionData[];
  createdAt: number;
  mode: 'vertical' | 'scattered';
  questionOrder: 'sequential' | 'random';
}

interface ResultData {
  groupName: string;
  totalTime: number;
  questionTimes: number[];
  questionStatus?: ('unanswered' | 'correct' | 'incorrect')[];
  mainKeywordTime: number | null;
  score: number;
  isFinished: boolean;
  joinTime?: number;
  endTime?: number;
}

interface SavedResultSession {
  id: string;
  name: string;
  date: number;
  results: Record<string, ResultData>;
}

// --- MOCK DATABASE (Dùng khi chưa cấu hình Firebase) ---
let mockGames: Record<string, GameState> = {};
let mockResults: Record<string, Record<string, ResultData>> = {};
let mockSavedResults: Record<string, Record<string, SavedResultSession>> = {};
let mockActiveGameId: string | null = null;
type Listener = (val: any) => void;
const listeners: Record<string, Listener[]> = {};

const notifyListeners = (path: string, val: any) => {
  listeners[path]?.forEach(l => l(val));
};

const dbSet = async (path: string, val: any) => {
  if (isFirebaseConfigured && db) {
    await set(ref(db, path), val);
  } else {
    if (path === 'activeGameId') {
      mockActiveGameId = val;
      notifyListeners(path, val);
    } else if (path.startsWith('games/')) {
      const id = path.split('/')[1];
      mockGames[id] = val;
      notifyListeners('games', mockGames);
      notifyListeners(path, val);
    } else if (path.startsWith('results/')) {
      const parts = path.split('/');
      const gameId = parts[1];
      const resId = parts[2];
      if (!mockResults[gameId]) mockResults[gameId] = {};
      mockResults[gameId][resId] = val;
      notifyListeners(`results/${gameId}`, mockResults[gameId]);
    } else if (path.startsWith('savedResults/')) {
      const parts = path.split('/');
      const gameId = parts[1];
      const sessionId = parts[2];
      if (!mockSavedResults[gameId]) mockSavedResults[gameId] = {};
      mockSavedResults[gameId][sessionId] = val;
      notifyListeners(`savedResults/${gameId}`, mockSavedResults[gameId]);
    }
  }
};

const dbRemove = async (path: string) => {
  if (isFirebaseConfigured && db) {
    await remove(ref(db, path));
  } else {
    if (path === 'activeGameId') {
      mockActiveGameId = null;
      notifyListeners(path, null);
    } else if (path.startsWith('games/')) {
      const id = path.split('/')[1];
      delete mockGames[id];
      notifyListeners('games', mockGames);
      notifyListeners(path, null);
    } else if (path.startsWith('results/')) {
      const gameId = path.split('/')[1];
      delete mockResults[gameId];
      notifyListeners(`results/${gameId}`, null);
    } else if (path.startsWith('savedResults/')) {
      const gameId = path.split('/')[1];
      delete mockSavedResults[gameId];
      notifyListeners(`savedResults/${gameId}`, null);
    }
  }
};

const dbOnValue = (path: string, callback: Listener) => {
  if (isFirebaseConfigured && db) {
    const unsubscribe = onValue(ref(db, path), (snapshot) => {
      callback(snapshot.val());
    });
    return () => unsubscribe();
  } else {
    if (!listeners[path]) listeners[path] = [];
    listeners[path].push(callback);
    
    if (path === 'activeGameId') callback(mockActiveGameId);
    else if (path === 'games') callback(mockGames);
    else if (path.startsWith('games/')) {
      const id = path.split('/')[1];
      callback(mockGames[id] || null);
    } else if (path.startsWith('results/')) {
      const gameId = path.split('/')[1];
      callback(mockResults[gameId] || null);
    } else if (path.startsWith('savedResults/')) {
      const gameId = path.split('/')[1];
      callback(mockSavedResults[gameId] || null);
    }
    
    return () => {
      listeners[path] = listeners[path].filter(l => l !== callback);
    };
  }
};

const generateId = () => {
  if (isFirebaseConfigured && db) {
    return push(ref(db, 'games')).key as string;
  }
  return `id_${Date.now()}`;
};

// --- COMPONENTS ---

function ConfirmModal({ isOpen, message, onConfirm, onCancel }: { isOpen: boolean, message: string, onConfirm: () => void, onCancel: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full">
        <div className="flex items-center text-amber-500 mb-4">
          <AlertTriangle className="w-6 h-6 mr-2" />
          <h3 className="text-lg font-bold text-gray-800">Xác nhận</h3>
        </div>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl font-medium transition-colors">Hủy</button>
          <button onClick={() => { onConfirm(); onCancel(); }} className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors">Đồng ý</button>
        </div>
      </div>
    </div>
  );
}

function AlertModal({ isOpen, message, onClose }: { isOpen: boolean, message: string, onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full">
        <div className="flex items-center text-[#00CCFF] mb-4">
          <Sparkles className="w-6 h-6 mr-2" />
          <h3 className="text-lg font-bold text-gray-800">Thông báo</h3>
        </div>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-[#00CCFF] text-white rounded-xl font-medium hover:bg-[#00b3e6] transition-colors">Đóng</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState<'admin' | 'student' | null>(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  useEffect(() => {
    const loggedIn = localStorage.getItem('adminLoggedIn');
    if (loggedIn === 'true') {
      setIsAdminLoggedIn(true);
    }
  }, []);

  const handleAdminLogin = () => {
    setIsAdminLoggedIn(true);
    localStorage.setItem('adminLoggedIn', 'true');
  };

  const handleAdminLogout = () => {
    setRole(null);
    setIsAdminLoggedIn(false);
    localStorage.removeItem('adminLoggedIn');
  };

  if (!role) {
    return (
      <div className="min-h-screen bg-[#00CCFF]/10 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-t-4 border-[#00CCFF]">
          <h1 className="text-3xl font-bold text-[#00CCFF] mb-2">Ô Chữ Kỳ Diệu</h1>
          <p className="text-gray-500 mb-8">(Trò chơi chuyển đổi số)</p>
          
          {!isFirebaseConfigured && (
            <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-sm flex items-start text-left">
              <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Chưa cấu hình Firebase!</p>
                <p className="mt-1">Ứng dụng đang chạy ở chế độ giả lập (Mock Mode). Dữ liệu sẽ không được lưu lại khi tải lại trang.</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={() => setRole('admin')}
              className="w-full py-4 px-6 bg-[#00CCFF] hover:bg-[#00b3e6] text-white rounded-xl font-semibold transition-colors flex items-center justify-center shadow-md shadow-[#00CCFF]/20"
            >
              <Settings className="w-5 h-5 mr-2" />
              Giáo viên (Admin)
            </button>
            <button
              onClick={() => setRole('student')}
              className="w-full py-4 px-6 bg-white border-2 border-[#00CCFF] text-[#00CCFF] hover:bg-[#00CCFF]/5 rounded-xl font-semibold transition-colors flex items-center justify-center"
            >
              <Users className="w-5 h-5 mr-2" />
              Học sinh (Người chơi)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'admin' && !isAdminLoggedIn) {
    return <AdminLogin onLogin={handleAdminLogin} onBack={() => setRole(null)} />;
  }

  return role === 'admin' ? 
    <AdminPanel onBack={handleAdminLogout} /> : 
    <StudentView onBack={() => setRole(null)} />;
}

// --- ADMIN LOGIN ---
function AdminLogin({ onLogin, onBack }: { onLogin: () => void, onBack: () => void }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd === 'thuyty123456@') {
      onLogin();
    } else {
      setError('Mật khẩu không đúng. Vui lòng thử lại.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full relative">
        <button onClick={onBack} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-gray-500" />
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Đăng nhập Giáo viên</h2>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            required
            value={pwd}
            onChange={(e) => { setPwd(e.target.value); setError(''); }}
            placeholder="Nhập mật khẩu..."
            className={cn(
              "w-full px-4 py-3 border-2 rounded-xl focus:ring-0 outline-none transition-colors mb-4 text-center text-lg",
              error ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-[#00CCFF]"
            )}
          />
          {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}
          <button type="submit" className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 transition-colors flex items-center justify-center">
            <LogIn className="w-5 h-5 mr-2" />
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}

// --- ADMIN PANEL ---
function AdminPanel({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'edit'>('list');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [games, setGames] = useState<Record<string, GameState>>({});
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsubGames = dbOnValue('games', (val) => setGames(val || {}));
    const unsubActive = dbOnValue('activeGameId', setActiveGameId);
    return () => { unsubGames(); unsubActive(); };
  }, []);

  if (view === 'create') {
    return <AdminGameForm onBack={() => setView('list')} />;
  }

  if (view === 'edit' && selectedGameId) {
    return <AdminGameForm onBack={() => setView('list')} initialGame={games[selectedGameId]} />;
  }

  if (view === 'detail' && selectedGameId) {
    return <AdminGameDetail gameId={selectedGameId} onBack={() => { setView('list'); setSelectedGameId(null); }} onEdit={() => setView('edit')} />;
  }

  // List View
  const handleDeleteGame = async (gameId: string) => {
    await dbRemove(`games/${gameId}`);
    await dbRemove(`results/${gameId}`);
    await dbRemove(`savedResults/${gameId}`);
    if (activeGameId === gameId) await dbSet('activeGameId', null);
    setConfirmDelete(null);
  };

  const gamesList = (Object.values(games) as GameState[]).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <ConfirmModal 
        isOpen={!!confirmDelete} 
        message="Bạn có chắc chắn muốn xóa bộ đề này và toàn bộ kết quả?" 
        onConfirm={() => confirmDelete && handleDeleteGame(confirmDelete)} 
        onCancel={() => setConfirmDelete(null)} 
      />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#00CCFF]">Danh sách Bộ Đề</h1>
            <p className="text-gray-500">Quản lý các trò chơi Ô Chữ Kỳ Diệu</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView('create')}
              className="px-4 py-2 bg-[#00CCFF] text-white rounded-lg font-semibold hover:bg-[#00b3e6] transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-1" /> Tạo bộ đề mới
            </button>
            <button onClick={onBack} className="text-gray-500 hover:text-gray-700 flex items-center">
              <LogOut className="w-5 h-5 mr-1" /> Đăng xuất
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {gamesList.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <List className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Chưa có bộ đề nào. Hãy tạo bộ đề đầu tiên!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {gamesList.map(game => (
                <div 
                  key={game.id} 
                  className="p-4 hover:bg-gray-50 flex items-center justify-between cursor-pointer transition-colors"
                  onClick={() => { setSelectedGameId(game.id); setView('detail'); }}
                >
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">{game.title}</h3>
                    <p className="text-sm text-gray-500">Từ khóa: <span className="font-mono text-[#00CCFF]">{game.mainKeyword}</span> • {game.questions.length} câu hỏi</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {activeGameId === game.id && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold animate-pulse">
                        Đang Mở
                      </span>
                    )}
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold",
                      game.status === 'waiting' ? "bg-amber-100 text-amber-700" :
                      game.status === 'playing' ? "bg-emerald-100 text-emerald-700" :
                      "bg-gray-100 text-gray-700"
                    )}>
                      {game.status === 'waiting' ? 'Đang chờ' : game.status === 'playing' ? 'Đang chơi' : 'Đã kết thúc'}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(game.id); }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa bộ đề này"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- ADMIN GAME FORM ---
function AdminGameForm({ onBack, initialGame }: { onBack: () => void, initialGame?: GameState }) {
  const [title, setTitle] = useState(initialGame?.title || '');
  const [description, setDescription] = useState(initialGame?.description || '');
  const [mainKeyword, setMainKeyword] = useState(initialGame?.mainKeyword || '');
  const [questions, setQuestions] = useState<QuestionData[]>(initialGame?.questions || []);
  const [mode, setMode] = useState<'vertical' | 'scattered'>(initialGame?.mode || 'vertical');
  const [questionOrder, setQuestionOrder] = useState<'sequential' | 'random'>(initialGame?.questionOrder || 'sequential');
  const [isGenerating, setIsGenerating] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const handleMainKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setMainKeyword(val);
    const key = createProcessingKey(val);
    const displayChars = getDisplayChars(val);
    
    const newQuestions: QuestionData[] = key.split('').map((_, index) => ({
      letter: displayChars[index] || key[index],
      answer: '',
      question: '',
      intersectIndex: -1
    }));
    setQuestions(newQuestions);
  };

  const updateQuestion = (index: number, field: keyof QuestionData, value: string) => {
    const newQuestions = [...questions];
    const q = newQuestions[index];
    
    if (field === 'answer') {
      const ansKey = createProcessingKey(value);
      q.answer = value.toUpperCase();
      const processingLetter = createProcessingKey(q.letter);
      q.intersectIndex = ansKey.indexOf(processingLetter);
    } else if (field === 'question') {
      q.question = value;
    }
    
    setQuestions(newQuestions);
  };

  const handleSaveGame = async () => {
    if (!mainKeyword) return setAlertMessage('Vui lòng nhập từ khóa chính');
    const invalidQ = questions.find(q => q.intersectIndex === -1 && q.answer !== '');
    if (invalidQ) return setAlertMessage(`Đáp án "${invalidQ.answer}" không chứa chữ cái "${invalidQ.letter}"`);
    const emptyQ = questions.find(q => !q.answer || !q.question);
    if (emptyQ) return setAlertMessage('Vui lòng điền đầy đủ câu hỏi và đáp án');

    const id = initialGame?.id || generateId();
    const newState: GameState = {
      id,
      title: title || `Bộ đề: ${mainKeyword}`,
      description,
      status: initialGame?.status || 'waiting',
      mainKeyword,
      processingKey: createProcessingKey(mainKeyword),
      questions,
      createdAt: initialGame?.createdAt || Date.now(),
      mode,
      questionOrder
    };

    await dbSet(`games/${id}`, newState);
    setAlertMessage('Đã lưu bộ đề thành công!');
  };

  const handleGenerateAI = async () => {
    let promptText = '';
    
    if (!title && !mainKeyword) {
      setAlertMessage('Vui lòng nhập Tên bộ đề hoặc Từ khóa chính để AI có thể tạo câu hỏi.');
      return;
    }
    
    const descContext = description ? `\nMô tả chi tiết: ${description}` : '';

    if (mainKeyword) {
      promptText = `Tạo một bộ câu hỏi trò chơi ô chữ tiếng Việt${title ? ` về chủ đề "${title}"` : ''}.${descContext}\nTừ khóa chính là "${mainKeyword}". 
Hãy tạo ra các câu hỏi và đáp án tương ứng cho từng chữ cái trong từ khóa chính (bỏ qua dấu cách).
Mỗi đáp án PHẢI chứa chữ cái tương ứng của từ khóa chính.
Trả về mảng JSON các object, mỗi object có:
- "letter": chữ cái từ từ khóa chính
- "answer": đáp án (từ hoặc cụm từ)
- "question": câu hỏi gợi ý cho đáp án đó.`;
    } else {
      promptText = `Tạo một bộ câu hỏi trò chơi ô chữ tiếng Việt về chủ đề "${title}".${descContext}
Hãy tự nghĩ ra một từ khóa chính (khoảng 5-10 chữ cái, không chứa khoảng trắng) liên quan đến chủ đề này.
Sau đó tạo ra các câu hỏi và đáp án tương ứng cho từng chữ cái trong từ khóa chính.
Mỗi đáp án PHẢI chứa chữ cái tương ứng của từ khóa chính.
Trả về một object JSON gồm:
- "mainKeyword": từ khóa chính
- "questions": mảng các object chứa "letter", "answer", "question".`;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: promptText,
        config: {
          responseMimeType: 'application/json',
          responseSchema: !mainKeyword ? {
            type: Type.OBJECT,
            properties: {
              mainKeyword: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    letter: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    question: { type: Type.STRING }
                  },
                  required: ["letter", "answer", "question"]
                }
              }
            },
            required: ["mainKeyword", "questions"]
          } : {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                letter: { type: Type.STRING },
                answer: { type: Type.STRING },
                question: { type: Type.STRING }
              },
              required: ["letter", "answer", "question"]
            }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Không có phản hồi từ AI");
      
      const data = JSON.parse(text);
      
      let generatedKeyword = mainKeyword;
      let generatedQuestions = [];

      if (!mainKeyword) {
        generatedKeyword = data.mainKeyword;
        generatedQuestions = data.questions;
        setMainKeyword(generatedKeyword);
        if (!title) {
          setTitle(`Bộ đề AI: ${generatedKeyword}`);
        }
      } else {
        generatedQuestions = data;
      }

      const key = createProcessingKey(generatedKeyword);
      const displayChars = getDisplayChars(generatedKeyword);
      
      const newQuestions: QuestionData[] = key.split('').map((_, index) => {
        const aiQ = generatedQuestions[index] || { answer: '', question: '' };
        const letter = displayChars[index] || key[index];
        const answer = aiQ.answer || '';
        const question = aiQ.question || '';
        
        let intersectIndex = -1;
        if (answer) {
          const ansKey = createProcessingKey(answer);
          const processingLetter = createProcessingKey(letter);
          intersectIndex = ansKey.indexOf(processingLetter);
        }

        return {
          letter,
          answer,
          question,
          intersectIndex
        };
      });

      setQuestions(newQuestions);
      setAlertMessage('Đã tạo đề bằng AI thành công! Vui lòng kiểm tra lại các câu hỏi và đáp án.');
    } catch (error) {
      console.error("AI Generation Error:", error);
      setAlertMessage('Có lỗi xảy ra khi tạo đề bằng AI. Vui lòng thử lại.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <AlertModal isOpen={!!alertMessage} message={alertMessage || ''} onClose={() => {
        setAlertMessage(null);
        if (alertMessage === 'Đã lưu bộ đề thành công!') onBack();
      }} />
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center text-gray-500 hover:text-gray-700 mb-6">
          <ChevronLeft className="w-5 h-5 mr-1" /> Quay lại danh sách
        </button>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">{initialGame ? 'Chỉnh Sửa Bộ Đề' : 'Tạo Bộ Đề Mới'}</h2>
            <button 
              type="button"
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="flex items-center text-sm bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
            >
              <Sparkles className={cn("w-4 h-4 mr-1", isGenerating && "animate-spin")} /> 
              {isGenerating ? 'Đang tạo...' : 'Tạo bằng AI'}
            </button>
          </div>

          <div className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên bộ đề (Chủ đề)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Kiểm tra 15 phút - Bài 12, Lịch sử Việt Nam..."
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00CCFF] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả chi tiết (Tùy chọn)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="VD: Tập trung vào các sự kiện lịch sử giai đoạn 1945-1954, các nhân vật lịch sử quan trọng..."
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00CCFF] outline-none resize-none h-24"
              />
              <p className="text-xs text-gray-500 mt-1">Nhập mô tả chi tiết để AI có cơ sở tạo câu hỏi chính xác và phù hợp hơn, tránh tiêu đề quá dài.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hình thức hiển thị từ khóa chính</label>
              <div className="flex gap-6 mt-2">
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    checked={mode === 'vertical'} 
                    onChange={() => setMode('vertical')} 
                    className="mr-2 w-4 h-4 text-[#00CCFF] focus:ring-[#00CCFF]" 
                  />
                  Hàng dọc
                </label>
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    checked={mode === 'scattered'} 
                    onChange={() => setMode('scattered')} 
                    className="mr-2 w-4 h-4 text-[#00CCFF] focus:ring-[#00CCFF]" 
                  />
                  Rải rác (Ngẫu nhiên)
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thứ tự câu hỏi</label>
              <div className="flex gap-6 mt-2">
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    checked={questionOrder === 'sequential'} 
                    onChange={() => setQuestionOrder('sequential')} 
                    className="mr-2 w-4 h-4 text-[#00CCFF] focus:ring-[#00CCFF]" 
                  />
                  Theo thứ tự từ khóa
                </label>
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    checked={questionOrder === 'random'} 
                    onChange={() => setQuestionOrder('random')} 
                    className="mr-2 w-4 h-4 text-[#00CCFF] focus:ring-[#00CCFF]" 
                  />
                  Ngẫu nhiên
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Từ khóa chính</label>
              <input
                type="text"
                value={mainKeyword}
                onChange={handleMainKeywordChange}
                placeholder="VD: HƠI NƯỚC"
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00CCFF] outline-none font-bold text-lg"
              />
            </div>
          </div>

          {questions.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 border-b pb-2">Các từ hàng ngang:</h3>
              {questions.map((q, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#00CCFF] text-white flex items-center justify-center font-bold mr-3">
                      {q.letter}
                    </div>
                    <span className="text-sm font-medium text-gray-600">Ô chữ số {i + 1}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <input
                        type="text"
                        value={q.answer}
                        onChange={(e) => updateQuestion(i, 'answer', e.target.value)}
                        placeholder="Đáp án (phải chứa chữ cái trên)"
                        className={cn(
                          "w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#00CCFF] outline-none",
                          q.answer && q.intersectIndex === -1 ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                        )}
                      />
                      {q.answer && q.intersectIndex === -1 && (
                        <p className="text-xs text-red-500 mt-1">Đáp án không chứa chữ cái "{q.letter}"</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        value={q.question}
                        onChange={(e) => updateQuestion(i, 'question', e.target.value)}
                        placeholder="Câu hỏi gợi ý"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#00CCFF] outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={handleSaveGame}
                className="w-full py-4 mt-6 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 transition-colors text-lg"
              >
                {initialGame ? 'Cập Nhật Bộ Đề' : 'Lưu Bộ Đề'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const renderQuestionDetails = (res: ResultData, totalQuestions: number) => {
  const details = [];
  for (let i = 0; i < totalQuestions; i++) {
    const status = res.questionStatus?.[i] || 'unanswered';
    const time = res.questionTimes?.[i] || 0;
    if (status === 'correct') {
      details.push(<span key={i} className="text-emerald-600 font-medium">Câu {i+1}: Đúng ({time}s)</span>);
    } else if (status === 'incorrect') {
      details.push(<span key={i} className="text-red-500 font-medium">Câu {i+1}: Sai</span>);
    } else {
      details.push(<span key={i} className="text-gray-400">Câu {i+1}: Chưa trả lời</span>);
    }
  }
  return (
    <div className="text-xs bg-white p-3 rounded-lg border border-gray-100 flex flex-wrap gap-2 mt-2">
      {details.map((d, i) => (
        <React.Fragment key={i}>
          {d}
          {i < details.length - 1 && <span className="text-gray-300">|</span>}
        </React.Fragment>
      ))}
    </div>
  );
};

function AdminGameHistory({ gameId, onBack }: { gameId: string, onBack: () => void }) {
  const [sessions, setSessions] = useState<Record<string, SavedResultSession>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<string | null>(null);
  const [confirmDeleteResult, setConfirmDeleteResult] = useState<{sessionId: string, resultId: string} | null>(null);

  useEffect(() => {
    const unsub = dbOnValue(`savedResults/${gameId}`, (val) => setSessions(val || {}));
    return () => unsub();
  }, [gameId]);

  const handleDeleteSession = async (sessionId: string) => {
    await dbRemove(`savedResults/${gameId}/${sessionId}`);
    setConfirmDeleteSession(null);
  };

  const handleDeleteSessionResult = async (sessionId: string, resultId: string) => {
    await dbRemove(`savedResults/${gameId}/${sessionId}/results/${resultId}`);
    setConfirmDeleteResult(null);
  };

  const sessionsList = (Object.values(sessions) as SavedResultSession[]).sort((a, b) => b.date - a.date);

  if (selectedSessionId && sessions[selectedSessionId]) {
    const session = sessions[selectedSessionId];
    const results = session.results || {};
    return (
      <div className="min-h-screen bg-gray-50 p-6 font-sans">
        <ConfirmModal 
          isOpen={!!confirmDeleteResult} 
          message="Bạn có chắc chắn muốn xóa kết quả của nhóm này?" 
          onConfirm={() => confirmDeleteResult && handleDeleteSessionResult(confirmDeleteResult.sessionId, confirmDeleteResult.resultId)} 
          onCancel={() => setConfirmDeleteResult(null)} 
        />
        <div className="max-w-5xl mx-auto">
          <button onClick={() => setSelectedSessionId(null)} className="flex items-center text-gray-500 hover:text-gray-700 mb-6">
            <ChevronLeft className="w-5 h-5 mr-1" /> Quay lại danh sách lịch sử
          </button>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[400px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Kết quả: {session.name}</h2>
              <div className="flex items-center text-sm text-gray-500">
                <Users className="w-4 h-4 mr-1" /> {Object.keys(results).length} nhóm
              </div>
            </div>
            
            {Object.keys(results).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                Không có dữ liệu kết quả cho phiên này.
              </div>
            ) : (
              <div className="space-y-3">
                {(Object.entries(results) as [string, ResultData][])
                  .sort(([,a], [,b]) => {
                    if (a.isFinished !== b.isFinished) return a.isFinished ? -1 : 1;
                    if (a.score !== b.score) return b.score - a.score;
                    return a.totalTime - b.totalTime;
                  })
                  .map(([id, res], index) => (
                    <div key={id} className="flex flex-col p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                            index === 0 ? "bg-yellow-100 text-yellow-700" :
                            index === 1 ? "bg-gray-200 text-gray-700" :
                            index === 2 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"
                          )}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-bold text-gray-800">{res.groupName}</p>
                            <p className="text-xs text-gray-500">
                              {res.isFinished ? 'Hoàn thành' : 'Chưa xong'} • {res.score} câu
                            </p>
                            {(res.joinTime || res.endTime) && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {res.joinTime ? new Date(res.joinTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'} 
                                {' - '} 
                                {res.endTime ? new Date(res.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-mono font-bold text-[#00CCFF]">{res.totalTime}s</p>
                            {res.mainKeywordTime && (
                              <p className="text-xs text-emerald-600">Từ khóa: {res.mainKeywordTime}s</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteSessionResult(session.id, id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                            title="Xóa kết quả này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {renderQuestionDetails(res, res.questionTimes?.length || 0)}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <ConfirmModal 
        isOpen={!!confirmDeleteSession} 
        message="Bạn có chắc chắn muốn xóa lịch sử kết quả này?" 
        onConfirm={() => confirmDeleteSession && handleDeleteSession(confirmDeleteSession)} 
        onCancel={() => setConfirmDeleteSession(null)} 
      />
      <div className="max-w-5xl mx-auto">
        <button onClick={onBack} className="flex items-center text-gray-500 hover:text-gray-700 mb-6">
          <ChevronLeft className="w-5 h-5 mr-1" /> Quay lại bộ đề
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800">Lịch sử kết quả</h2>
            <p className="text-gray-500">Danh sách các lần chơi đã lưu của bộ đề này</p>
          </div>

          {sessionsList.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Chưa có lịch sử kết quả nào được lưu.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sessionsList.map(session => (
                <div 
                  key={session.id} 
                  className="p-4 hover:bg-gray-50 flex items-center justify-between cursor-pointer transition-colors"
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">{session.name}</h3>
                    <p className="text-sm text-gray-500">
                      Thời gian: {new Date(session.date).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">
                      {Object.keys(session.results || {}).length} nhóm
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteSession(session.id); }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa lịch sử này"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- ADMIN GAME DETAIL ---
function AdminGameDetail({ gameId, onBack, onEdit }: { gameId: string, onBack: () => void, onEdit: () => void }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [results, setResults] = useState<Record<string, ResultData>>({});
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [viewHistory, setViewHistory] = useState(false);
  const [confirmDeleteGame, setConfirmDeleteGame] = useState(false);
  const [confirmEndGame, setConfirmEndGame] = useState(false);
  const [confirmDeleteResult, setConfirmDeleteResult] = useState<string | null>(null);
  const [requirePassword, setRequirePassword] = useState(false);

  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubGame = dbOnValue(`games/${gameId}`, setGame);
    const unsubResults = dbOnValue(`results/${gameId}`, (val) => setResults(val || {}));
    const unsubActive = dbOnValue('activeGameId', setActiveGameId);
    return () => { unsubGame(); unsubResults(); unsubActive(); };
  }, [gameId]);

  if (viewHistory) {
    return <AdminGameHistory gameId={gameId} onBack={() => setViewHistory(false)} />;
  }

  if (!game) return <div className="p-8 text-center">Đang tải...</div>;

  const isActive = activeGameId === gameId;
  const isAnotherGameActive = activeGameId !== null && activeGameId !== gameId;

  const handleDeleteResult = async (resultId: string) => {
    await dbRemove(`results/${gameId}/${resultId}`);
    setConfirmDeleteResult(null);
  };

  const handleStartGame = async () => {
    const sessionPassword = requirePassword ? Math.floor(100000 + Math.random() * 900000).toString() : null;
    await dbSet('activeGameId', gameId);
    await dbSet(`games/${gameId}/status`, 'playing');
    if (sessionPassword) {
      await dbSet(`games/${gameId}/sessionPassword`, sessionPassword);
    } else {
      await dbRemove(`games/${gameId}/sessionPassword`);
    }
  };

  const handleEndGameWithoutSaving = async () => {
    await dbRemove(`results/${gameId}`);
    await dbRemove(`games/${gameId}/sessionPassword`);
    if (isActive) await dbSet('activeGameId', null);
    await dbSet(`games/${gameId}/status`, 'waiting');
    setConfirmEndGame(false);
    onBack();
  };

  const handleEndGame = async () => {
    setConfirmEndGame(true);
  };

  const handleSaveSession = async () => {
    if (!sessionName.trim()) return setAlertMessage('Vui lòng nhập tên kết quả (VD: Lớp 6A - Tiết 1)');
    const sessionId = `session_${Date.now()}`;
    await dbSet(`savedResults/${gameId}/${sessionId}`, {
      id: sessionId,
      name: sessionName,
      date: Date.now(),
      results
    });
    await dbRemove(`results/${gameId}`);
    await dbRemove(`games/${gameId}/sessionPassword`);
    if (isActive) await dbSet('activeGameId', null);
    await dbSet(`games/${gameId}/status`, 'waiting');
    setIsSavingResult(false);
    onBack();
  };

  const handleDeleteGame = async () => {
    await dbRemove(`games/${gameId}`);
    await dbRemove(`results/${gameId}`);
    await dbRemove(`savedResults/${gameId}`);
    if (isActive) await dbSet('activeGameId', null);
    setConfirmDeleteGame(false);
    onBack();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <AlertModal isOpen={!!alertMessage} message={alertMessage || ''} onClose={() => setAlertMessage(null)} />
      <ConfirmModal 
        isOpen={confirmDeleteGame} 
        message="Bạn có chắc chắn muốn xóa bộ đề này và toàn bộ kết quả?" 
        onConfirm={handleDeleteGame} 
        onCancel={() => setConfirmDeleteGame(false)} 
      />
      <ConfirmModal 
        isOpen={!!confirmDeleteResult} 
        message="Bạn có chắc chắn muốn xóa kết quả của nhóm này?" 
        onConfirm={() => confirmDeleteResult && handleDeleteResult(confirmDeleteResult)} 
        onCancel={() => setConfirmDeleteResult(null)} 
      />
      {confirmEndGame && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full">
            <div className="flex items-center text-amber-500 mb-4">
              <AlertTriangle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-bold text-gray-800">Kết thúc trò chơi</h3>
            </div>
            <p className="text-gray-600 mb-6">Bạn có muốn lưu lại kết quả của phiên chơi này không?</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setConfirmEndGame(false); setIsSavingResult(true); }}
                className="w-full py-2 bg-[#00CCFF] text-white rounded-xl font-semibold hover:bg-[#00b3e6] transition-colors"
              >
                Đồng ý lưu
              </button>
              <button
                onClick={handleEndGameWithoutSaving}
                className="w-full py-2 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100 transition-colors"
              >
                Không lưu, kết thúc luôn
              </button>
              <button
                onClick={() => setConfirmEndGame(false)}
                className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
        <button onClick={onBack} className="flex items-center text-gray-500 hover:text-gray-700 mb-6">
          <ChevronLeft className="w-5 h-5 mr-1" /> Quay lại danh sách
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cột trái: Thông tin & Điều khiển */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 mb-2">{game.title}</h2>
              <p className="text-gray-500 mb-6">Từ khóa: <span className="font-bold text-[#00CCFF]">{game.mainKeyword}</span></p>
              
              <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-200 text-center relative">
                {isActive && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-[#00CCFF] text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                    Bộ đề đang mở
                  </div>
                )}
                <p className="text-sm text-gray-500 mb-1">Trạng thái hiện tại:</p>
                <p className={cn(
                  "font-bold text-xl",
                  game.status === 'waiting' ? "text-amber-500" :
                  game.status === 'playing' ? "text-emerald-500" : "text-gray-500"
                )}>
                  {game.status === 'waiting' ? 'Đang chờ học sinh' : 
                   game.status === 'playing' ? 'Đang chơi' : 'Đã kết thúc'}
                </p>
                {game.status === 'playing' && game.sessionPassword && (
                  <div className="mt-4 p-3 bg-amber-100 text-amber-800 rounded-lg flex items-center justify-center gap-2 font-bold">
                    <Lock className="w-5 h-5" />
                    Mật khẩu phòng: <span className="text-2xl tracking-widest">{game.sessionPassword}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {game.status !== 'playing' && (
                  <label className="flex items-center gap-2 text-gray-700 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={requirePassword} 
                      onChange={e => setRequirePassword(e.target.checked)} 
                      className="w-5 h-5 rounded text-[#00CCFF] focus:ring-[#00CCFF]" 
                    />
                    <span className="font-medium">Yêu cầu mật khẩu tham gia</span>
                  </label>
                )}
                <button
                  onClick={handleStartGame}
                  disabled={isAnotherGameActive || game.status === 'playing'}
                  className="w-full py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <Play className="w-5 h-5 mr-2" /> Bắt Đầu Chơi
                </button>
                <button
                  onClick={handleEndGame}
                  disabled={!isActive || game.status !== 'playing'}
                  className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <Square className="w-5 h-5 mr-2" /> Kết Thúc & Lưu Kết Quả
                </button>
                <button
                  onClick={onEdit}
                  disabled={isActive}
                  className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-semibold hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors mt-4"
                >
                  <Save className="w-5 h-5 mr-2" /> Chỉnh Sửa Bộ Đề
                </button>
                <button
                  onClick={() => setViewHistory(true)}
                  className="w-full py-3 bg-purple-50 text-purple-600 rounded-xl font-semibold hover:bg-purple-100 flex items-center justify-center transition-colors mt-4"
                >
                  <Clock className="w-5 h-5 mr-2" /> Xem Lịch Sử Kết Quả
                </button>
                <button
                  onClick={() => setConfirmDeleteGame(true)}
                  disabled={isActive}
                  className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors mt-4"
                >
                  <Trash2 className="w-5 h-5 mr-2" /> Xóa Bộ Đề Này
                </button>
              </div>
            </div>
          </div>

          {/* Cột phải: Bảng xếp hạng Realtime */}
          <div className="lg:col-span-2 space-y-6">
            {isSavingResult ? (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[400px]">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Lưu Kết Quả Trò Chơi</h2>
                <p className="text-gray-600 mb-6">Trò chơi đã kết thúc. Vui lòng nhập tên cho phiên kết quả này để lưu trữ (Ví dụ: Lớp 6A - Tiết 1).</p>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Nhập tên kết quả..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00CCFF] outline-none mb-6 text-lg"
                />
                <div className="flex gap-4">
                  <button
                    onClick={() => setIsSavingResult(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleSaveSession}
                    className="flex-1 py-3 bg-[#00CCFF] text-white rounded-xl font-semibold hover:bg-[#00b3e6] transition-colors"
                  >
                    Lưu & Quay Lại
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[400px]">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Kết quả Realtime</h2>
                  <div className="flex items-center text-sm text-gray-500">
                    <Users className="w-4 h-4 mr-1" /> {Object.keys(results).length} nhóm đã nộp
                  </div>
                </div>
                
                {Object.keys(results).length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    {game.status === 'playing' ? (
                      <div className="animate-pulse">Đang chờ học sinh nộp bài...</div>
                    ) : (
                      <div>Chưa có kết quả nào.</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(Object.entries(results) as [string, ResultData][])
                      .sort(([,a], [,b]) => {
                        // Sắp xếp: Hoàn thành trước, điểm cao trước, thời gian ít trước
                        if (a.isFinished !== b.isFinished) return a.isFinished ? -1 : 1;
                        if (a.score !== b.score) return b.score - a.score;
                        return a.totalTime - b.totalTime;
                      })
                      .map(([id, res], index) => (
                      <div key={id} className="flex flex-col p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-[#00CCFF] text-white flex items-center justify-center text-sm font-bold mr-4">
                              {index + 1}
                            </div>
                            <div>
                              <span className="font-bold text-gray-800 text-lg">{res.groupName}</span>
                              <div className="flex items-center text-xs mt-1">
                                {res.isFinished ? (
                                  <span className="text-emerald-600 flex items-center font-medium"><Check className="w-3 h-3 mr-1"/> Giải được từ khóa chính</span>
                                ) : (
                                  <span className="text-amber-600 flex items-center font-medium"><XCircle className="w-3 h-3 mr-1"/> Chưa giải được từ khóa chính ({res.score}/{game.questions.length})</span>
                                )}
                              </div>
                              {(res.joinTime || res.endTime) && (
                                <div className="text-xs text-gray-400 mt-1">
                                  {res.joinTime ? new Date(res.joinTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'} 
                                  {' - '} 
                                  {res.endTime ? new Date(res.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Đang chơi...'}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center text-lg text-gray-700 font-mono font-bold bg-white px-3 py-1 rounded-lg border border-gray-200">
                              <Clock className="w-4 h-4 mr-2 text-gray-400" />
                              {res.totalTime}s
                            </div>
                            <button
                              onClick={() => setConfirmDeleteResult(id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                              title="Xóa kết quả này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {renderQuestionDetails(res, game.questions.length)}
                        <div className="text-xs text-gray-500 bg-white p-3 rounded-lg border border-gray-100 mt-2">
                          <div><span className="font-semibold text-gray-700">Thời gian từ khóa chính:</span> {res.mainKeywordTime ? `${res.mainKeywordTime}s` : 'N/A'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- STUDENT VIEW ---
function StudentView({ onBack }: { onBack: () => void }) {
  const [groupName, setGroupName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  
  // Game state cho học sinh
  const [answers, setAnswers] = useState<string[]>([]);
  const [revealedRows, setRevealedRows] = useState<boolean[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]);
  const [questionStatus, setQuestionStatus] = useState<('unanswered' | 'correct' | 'incorrect')[]>([]);
  const [resultId, setResultId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  
  // Thêm state cho từ khóa chính
  const [mainKeywordGuess, setMainKeywordGuess] = useState('');
  const [answeredOrder, setAnsweredOrder] = useState<number[]>([]);
  const [displayIndices, setDisplayIndices] = useState<number[]>([]);
  const [mainKeywordTime, setMainKeywordTime] = useState<number | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [shouldGoBack, setShouldGoBack] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinTimeMs, setJoinTimeMs] = useState<number>(0);
  const [endTimeMs, setEndTimeMs] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{type: 'success'|'error', message: string} | null>(null);
  const [mainKeywordError, setMainKeywordError] = useState('');

  useEffect(() => {
    return dbOnValue('activeGameId', setActiveGameId);
  }, []);

  useEffect(() => {
    if (activeGameId) {
      return dbOnValue(`games/${activeGameId}`, (val: GameState | null) => {
        setGameState(val);
        if (isJoined && val && val.status === 'playing' && !startTime) {
          setAnswers(new Array(val.questions.length).fill(''));
          setRevealedRows(new Array(val.questions.length).fill(false));
          setQuestionTimes(new Array(val.questions.length).fill(0));
          setQuestionStatus(new Array(val.questions.length).fill('unanswered'));
          setStartTime(Date.now());
          setAnsweredOrder([]);
          
          const newResultId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          setResultId(newResultId);
          
          dbSet(`results/${activeGameId}/${newResultId}`, {
            groupName,
            totalTime: 0,
            questionTimes: new Array(val.questions.length).fill(0),
            questionStatus: new Array(val.questions.length).fill('unanswered'),
            mainKeywordTime: null,
            score: 0,
            isFinished: false,
            joinTime: joinTimeMs || Date.now()
          });

          const indices = Array.from({ length: val.questions.length }, (_, i) => i);
          if (val.questionOrder === 'random') {
            for (let i = indices.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [indices[i], indices[j]] = [indices[j], indices[i]];
            }
          }
          setDisplayIndices(indices);
        }
      });
    } else {
      setGameState(null);
    }
  }, [activeGameId, isJoined, startTime]);

  useEffect(() => {
    // Nếu giáo viên đóng bộ đề hoặc chuyển bộ đề khác khi đang chơi
    if (isJoined && !activeGameId) {
      setAlertMessage('Giáo viên đã đóng bộ đề hiện tại.');
      setShouldGoBack(true);
    }
  }, [activeGameId, isJoined]);

  const submitResult = (isFinished: boolean, mkTime: number | null = null, currentQuestionStatus?: ('unanswered' | 'correct' | 'incorrect')[], currentQuestionTimes?: number[], currentRevealedRows?: boolean[], isLeaving: boolean = false) => {
    if (!gameState || !activeGameId || !resultId) return;
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const resolvedRevealedRows = currentRevealedRows || revealedRows;
    const score = isFinished ? gameState.questions.length : resolvedRevealedRows.filter(r => r).length;
    
    const newEndTime = (isFinished || isLeaving) ? Date.now() : endTimeMs;
    if ((isFinished || isLeaving) && !endTimeMs) {
      setEndTimeMs(newEndTime);
    }

    dbSet(`results/${activeGameId}/${resultId}`, {
      groupName,
      totalTime,
      questionTimes: currentQuestionTimes || questionTimes,
      questionStatus: currentQuestionStatus || questionStatus,
      mainKeywordTime: mkTime,
      score,
      isFinished,
      joinTime: joinTimeMs || startTime,
      ...(newEndTime ? { endTime: newEndTime } : {})
    });
  };

  const submitResultRef = useRef(submitResult);
  useEffect(() => {
    submitResultRef.current = submitResult;
  });

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isJoined && activeGameId && resultId && !isCompleted) {
        submitResultRef.current(false, null, undefined, undefined, undefined, true);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isJoined, activeGameId, resultId, isCompleted]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (gameState?.sessionPassword && joinPassword !== gameState.sessionPassword) {
      setJoinError('Mật khẩu không chính xác!');
      return;
    }
    if (groupName.trim() && activeGameId) {
      setIsJoined(true);
      setJoinError('');
      setJoinTimeMs(Date.now());
    }
  };

  const handleEndEarly = () => {
    submitResult(false, null, undefined, undefined, undefined, true);
    onBack();
  };

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRow === null || !gameState || !currentInput.trim()) return;

    const q = gameState.questions[selectedRow];
    const inputKey = createProcessingKey(currentInput);
    const answerKey = createProcessingKey(q.answer);

    if (inputKey === answerKey) {
      const newRevealed = [...revealedRows];
      newRevealed[selectedRow] = true;
      setRevealedRows(newRevealed);
      
      const newAnswers = [...answers];
      newAnswers[selectedRow] = q.answer;
      setAnswers(newAnswers);

      const timeTaken = Math.floor((Date.now() - startTime) / 1000);
      const newTimes = [...questionTimes];
      newTimes[selectedRow] = timeTaken;
      setQuestionTimes(newTimes);
      
      const newStatus = [...questionStatus];
      newStatus[selectedRow] = 'correct';
      setQuestionStatus(newStatus);
      
      setAnsweredOrder(prev => [...prev, selectedRow]);

      setAnswerFeedback({ type: 'success', message: 'Bạn đã trả lời chính xác câu hỏi!' });
      setCurrentInput('');
      
      submitResult(false, null, newStatus, newTimes, newRevealed);
    } else {
      const newStatus = [...questionStatus];
      if (newStatus[selectedRow] !== 'correct') {
        newStatus[selectedRow] = 'incorrect';
        setQuestionStatus(newStatus);
        submitResult(false, null, newStatus, questionTimes, revealedRows);
      }
      setAnswerFeedback({ type: 'error', message: 'Đáp án sai, hãy nhập đáp án khác.' });
    }
  };

  const handleMainKeywordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameState) return;
    const guessKey = createProcessingKey(mainKeywordGuess);
    if (guessKey === gameState.processingKey) {
      const mkTime = Math.floor((Date.now() - startTime) / 1000);
      setMainKeywordTime(mkTime);
      submitResult(true, mkTime);
      setIsCompleted(true);
      setMainKeywordError('');
    } else {
      setMainKeywordError('Từ khóa chính chưa chính xác, hãy thử lại!');
    }
  };

  // 1. Màn hình đăng nhập
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#00CCFF] flex items-center justify-center p-4 font-sans">
        <AlertModal isOpen={!!alertMessage} message={alertMessage || ''} onClose={() => {
          setAlertMessage(null);
          if (shouldGoBack) onBack();
        }} />
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full relative">
          <button onClick={onBack} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-16 h-16 bg-[#00CCFF]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-[#00CCFF]" />
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Vào Phòng Chơi</h2>
          
          {!activeGameId ? (
            <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-200 text-gray-500">
              Hiện tại giáo viên chưa mở bộ đề nào. Vui lòng đợi!
            </div>
          ) : (
            <form onSubmit={handleJoin}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên nhóm của bạn</label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="VD: Nhóm 1"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#00CCFF] focus:ring-0 outline-none transition-colors text-center text-lg font-semibold"
                />
              </div>
              {gameState?.sessionPassword && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu phòng</label>
                  <input
                    type="text"
                    required
                    value={joinPassword}
                    onChange={(e) => { setJoinPassword(e.target.value); setJoinError(''); }}
                    placeholder="Nhập mật khẩu"
                    className={cn(
                      "w-full px-4 py-3 border-2 rounded-xl focus:ring-0 outline-none transition-colors text-center text-lg font-semibold tracking-widest uppercase",
                      joinError ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#00CCFF]"
                    )}
                  />
                  {joinError && <p className="text-red-500 text-sm mt-2 text-center font-medium">{joinError}</p>}
                </div>
              )}
              <button type="submit" className="w-full py-3 bg-[#00CCFF] text-white rounded-xl font-bold hover:bg-[#00b3e6] transition-colors flex items-center justify-center">
                <LogIn className="w-5 h-5 mr-2" /> Vào Phòng
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // 2. Màn hình chờ
  if (!gameState || gameState.status === 'waiting') {
    return (
      <div className="min-h-screen bg-[#00CCFF] flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center relative">
          <button onClick={() => setIsJoined(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <LogOut className="w-5 h-5" />
          </button>
          <div className="animate-spin w-12 h-12 border-4 border-[#00CCFF] border-t-transparent rounded-full mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Đang chờ giáo viên</h2>
          <p className="text-gray-500">Xin chào <span className="font-bold text-[#00CCFF]">{groupName}</span>, trò chơi sẽ sớm bắt đầu!</p>
        </div>
      </div>
    );
  }

  // 3. Màn hình kết thúc chung (Giáo viên end game)
  if (gameState.status === 'ended') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans text-white text-center">
        <div>
          <Square className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-2">Trò chơi đã kết thúc!</h2>
          <p className="text-gray-400">Giáo viên đã đóng bộ đề này.</p>
          <button onClick={onBack} className="mt-8 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">Quay lại trang chủ</button>
        </div>
      </div>
    );
  }

  // 4. Màn hình hoàn thành của nhóm
  if (isCompleted) {
    return (
      <div className="min-h-screen bg-emerald-500 flex items-center justify-center p-4 font-sans text-white text-center">
        <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-sm border border-white/20">
          <CheckCircle2 className="w-20 h-20 text-white mx-auto mb-6" />
          <h2 className="text-4xl font-bold mb-2">Chúc mừng!</h2>
          <p className="text-emerald-100 text-lg mb-6">Nhóm <span className="font-bold text-white">{groupName}</span> đã giải mã thành công từ khóa chính.</p>
          <div className="inline-block bg-black/20 px-6 py-3 rounded-xl font-mono text-2xl font-bold">
            Thời gian: {mainKeywordTime}s
          </div>
          <div className="mt-8">
            <button onClick={onBack} className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors font-semibold">
              Thoát
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Màn hình chơi game
  const maxLeft = gameState.mode === 'vertical' 
    ? Math.max(...gameState.questions.map(q => q.intersectIndex))
    : 0;
  
  return (
    <div className="min-h-screen bg-[#00CCFF]/5 p-4 md:p-8 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm border border-[#00CCFF]/20">
        <div className="font-bold text-gray-800 flex items-center">
          <Users className="w-5 h-5 text-[#00CCFF] mr-2" />
          {groupName}
        </div>
        <div className="flex items-center gap-4">
          <div className="font-mono font-bold text-[#00CCFF] bg-[#00CCFF]/10 px-4 py-1.5 rounded-lg flex items-center">
            <Clock className="w-4 h-4 mr-2" /> Đang tính giờ...
          </div>
          <button 
            onClick={handleEndEarly}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg font-semibold text-sm transition-colors flex items-center"
          >
            <Square className="w-4 h-4 mr-1" /> Kết thúc trò chơi
          </button>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col md:flex-row gap-8 items-start justify-center">
        {/* Lưới ô chữ & Giải mã từ khóa */}
        <div className="w-full md:w-auto flex flex-col gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 overflow-x-auto">
            <div className="flex flex-col gap-2 mx-auto w-max">
              {displayIndices.map((originalIndex, displayRowIndex) => {
                const q = gameState.questions[originalIndex];
                const displayChars = getDisplayChars(q.answer);
                const isRevealed = revealedRows[originalIndex];
                const offset = gameState.mode === 'vertical' ? maxLeft - q.intersectIndex : 0;
                
                return (
                  <div 
                    key={originalIndex} 
                    className={cn(
                      "flex gap-1 cursor-pointer transition-transform hover:scale-[1.02]",
                      selectedRow === originalIndex ? "ring-4 ring-[#00CCFF]/30 rounded-lg" : ""
                    )}
                    onClick={() => {
                      setSelectedRow(originalIndex);
                      setAnswerFeedback(null);
                      setCurrentInput('');
                    }}
                  >
                    {Array.from({ length: offset }).map((_, i) => (
                      <div key={`space-${i}`} className="w-10 h-10 md:w-12 md:h-12"></div>
                    ))}
                    
                    {displayChars.map((char, colIndex) => {
                      const isIntersect = colIndex === q.intersectIndex;
                      return (
                        <div 
                          key={colIndex}
                          className={cn(
                            "w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-lg md:text-xl font-bold rounded-md border-2 transition-all duration-500",
                            isRevealed 
                              ? isIntersect
                                ? "bg-amber-400 border-amber-500 text-white shadow-inner"
                                : "bg-[#00CCFF] border-[#00b3e6] text-white"
                              : isIntersect
                                ? "bg-amber-100 border-amber-300 text-transparent"
                                : "bg-gray-100 border-gray-300 text-transparent"
                          )}
                        >
                          {isRevealed ? char : ''}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Khu vực giải mã từ khóa chính */}
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-[#00CCFF]/20">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Giải Mã Từ Khóa Chính</h3>
            
            <div className="mb-6">
              <p className="text-sm text-gray-500 text-center mb-2">Các ký tự đã tìm được (theo thứ tự trả lời):</p>
              <div className="flex flex-wrap justify-center gap-2 min-h-[40px]">
                {answeredOrder.map((originalIndex, idx) => {
                  const q = gameState.questions[originalIndex];
                  const char = getDisplayChars(q.answer)[q.intersectIndex];
                  return (
                    <div key={idx} className="w-10 h-10 flex items-center justify-center text-lg font-bold rounded-md border-2 bg-amber-400 border-amber-500 text-white">
                      {char}
                    </div>
                  );
                })}
                {answeredOrder.length === 0 && (
                  <span className="text-gray-400 text-sm italic flex items-center">Chưa có ký tự nào</span>
                )}
              </div>
            </div>

            <form onSubmit={handleMainKeywordSubmit} className="max-w-md mx-auto">
              <input
                type="text"
                value={mainKeywordGuess}
                onChange={e => {
                  setMainKeywordGuess(e.target.value.toUpperCase());
                  setMainKeywordError('');
                }}
                placeholder="Nhập từ khóa chính..."
                className={cn(
                  "w-full px-4 py-3 border-2 rounded-xl focus:ring-0 outline-none transition-colors mb-2 text-center text-xl font-bold uppercase",
                  mainKeywordError ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#00CCFF]"
                )}
              />
              {mainKeywordError && (
                <p className="text-red-500 text-sm mb-4 text-center font-medium">
                  {mainKeywordError}
                </p>
              )}
              <button 
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-[#00CCFF] to-blue-500 text-white rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center mt-2"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Trả lời Từ Khóa Chính
              </button>
            </form>
          </div>
        </div>

        {/* Khu vực trả lời hàng ngang */}
        <div className="w-full md:w-96 bg-white p-6 rounded-3xl shadow-xl border border-gray-100 sticky top-8">
          {selectedRow === null ? (
            <div className="text-center py-12 text-gray-400">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Chọn một hàng bên trái để xem câu hỏi</p>
            </div>
          ) : (
            <div>
              <div className="inline-block bg-[#00CCFF]/10 text-[#00CCFF] font-bold px-3 py-1 rounded-lg text-sm mb-4">
                Hàng ngang số {displayIndices.indexOf(selectedRow) + 1}
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-6 leading-relaxed">
                {gameState.questions[selectedRow].question}
              </h3>
              
              {revealedRows[selectedRow] ? (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-emerald-600 font-bold text-xl mb-2">Bạn đã trả lời chính xác câu hỏi!</p>
                  <p className="text-gray-500 mb-6">Đáp án: <span className="font-bold text-gray-800">{gameState.questions[selectedRow].answer}</span></p>
                  <button 
                    type="button" 
                    onClick={() => { setSelectedRow(null); setAnswerFeedback(null); }} 
                    className="px-8 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    Tiếp tục
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAnswerSubmit}>
                  <input
                    type="text"
                    autoFocus
                    value={currentInput}
                    onChange={(e) => {
                      setCurrentInput(e.target.value.toUpperCase());
                      setAnswerFeedback(null);
                    }}
                    placeholder="Nhập câu trả lời..."
                    className={cn(
                      "w-full px-4 py-3 border-2 rounded-xl focus:ring-0 outline-none transition-colors mb-2 text-lg uppercase",
                      answerFeedback?.type === 'error' ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#00CCFF]"
                    )}
                  />
                  {answerFeedback && answerFeedback.type === 'error' && (
                    <p className="text-red-500 text-sm mb-4 font-medium">
                      {answerFeedback.message}
                    </p>
                  )}
                  <button 
                    type="submit"
                    className="w-full py-3 bg-[#00CCFF] text-white rounded-xl font-bold hover:bg-[#00b3e6] transition-colors mt-2"
                  >
                    Trả lời
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
