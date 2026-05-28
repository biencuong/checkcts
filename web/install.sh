#!/usr/bin/env bash
# CheckCTS web - cài đặt trên server Linux (aaPanel).
# Dùng: bash install.sh    (chạy trong thư mục chứa server.js)
set -e
cd "$(dirname "$0")"

echo "============================================================"
echo " CheckCTS web - cài đặt (aaPanel / Linux)"
echo "============================================================"

# 1) Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[LỖI] Chưa có Node.js."
  echo "  -> Cài qua aaPanel: App Store > 'PM2 Manager' (kèm Node) hoặc 'Node Version Manager'."
  exit 1
fi
echo "[*] Node.js: $(node -v)"

# 2) Font tiếng Việt cho báo cáo PDF (DejaVu/Noto/Liberation đều hỗ trợ tiếng Việt)
if ! find /usr/share/fonts -type f 2>/dev/null | grep -qiE 'DejaVuSans|NotoSans|LiberationSans'; then
  echo "[*] Cài font tiếng Việt cho PDF..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y fonts-dejavu-core || true
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y dejavu-sans-fonts || true
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y dejavu-sans-fonts || true
  else
    echo "    [CẢNH BÁO] Không rõ trình quản lý gói. Hãy cài thủ công gói font DejaVu/Noto,"
    echo "    hoặc đặt file .ttf vào thư mục web/fonts/ (DejaVuSans.ttf, DejaVuSans-Bold.ttf)."
  fi
fi

# 3) Phụ thuộc Node
echo "[*] Cài phụ thuộc Node (npm)..."
if [ -f package-lock.json ]; then
  npm ci --omit=dev || npm install --omit=dev || npm install
else
  npm install --omit=dev || npm install
fi
# Ghi chú: better-sqlite3 là native module. Nếu npm báo lỗi biên dịch, cài build tools:
#   apt:  sudo apt-get install -y build-essential python3
#   yum:  sudo yum groupinstall -y 'Development Tools' && sudo yum install -y python3
# rồi chạy lại:  npm rebuild better-sqlite3

# 4) Thư mục dữ liệu
mkdir -p data

# 5) Khởi động bằng PM2 nếu có
echo "[*] Khởi động..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.js
  pm2 save
  echo "[OK] Đã chạy qua PM2 (xem: pm2 status / pm2 logs checkcts-web)."
else
  echo "[!] Chưa có PM2. Cài:  npm i -g pm2   (hoặc dùng 'PM2 Manager' trong aaPanel)."
  echo "    Chạy tay để thử:    PORT=3900 CHECKCTS_ADMIN_KEY=DOI_KHOA_NAY node server.js"
fi

echo "============================================================"
echo " Xong. Web lắng nghe ở cổng 3900."
echo " -> Trong aaPanel tạo Website + Reverse Proxy tới http://127.0.0.1:3900"
echo " -> NHỚ đổi CHECKCTS_ADMIN_KEY trong ecosystem.config.js"
echo "============================================================"
