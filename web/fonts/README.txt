Thư mục font tiếng Việt cho báo cáo PDF (tùy chọn).

Nếu server KHÔNG có sẵn font hệ thống hỗ trợ tiếng Việt, hãy đặt 2 file sau vào đây:
  - DejaVuSans.ttf        (font thường)
  - DejaVuSans-Bold.ttf   (font đậm)

App sẽ tự nhận theo thứ tự: biến môi trường CHECKCTS_FONT/CHECKCTS_FONT_BOLD
-> file trong thư mục này -> font hệ thống (Linux/Windows/macOS).

Có thể dùng font khác hỗ trợ tiếng Việt (Noto Sans, Liberation Sans...) bằng cách
đổi tên thành font.ttf / font-bold.ttf, hoặc trỏ qua biến môi trường.

Tải DejaVu (giấy phép tự do, hỗ trợ tiếng Việt): https://dejavu-fonts.github.io/
