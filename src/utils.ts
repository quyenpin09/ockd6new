export function createProcessingKey(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Xóa dấu tiếng Việt
    .replace(/\s+/g, "") // Xóa khoảng trắng
    .toUpperCase(); // Viết hoa
}

// Lấy mảng ký tự để hiển thị (giữ nguyên dấu, chỉ bỏ khoảng trắng)
export function getDisplayChars(str: string): string[] {
  return str.replace(/\s+/g, "").toUpperCase().split('');
}

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
