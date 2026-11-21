# Báo cáo review — FlowBoard MVP

- Ngày: 2026-11-21
- Phạm vi: toàn bộ nhánh `claude/flowboard-mvp` (commit `5406ad9..cd0b374`)
- Người review: một subagent reviewer mới (context độc lập với người viết code), làm theo
  `superpowers:requesting-code-review`, đối chiếu với Spec, Plan, mục *Review Focus* và các *Ruling* trong ledger.
- Kết luận của reviewer: **“Ready to merge: With fixes”**. Không có lỗi Critical.

## 1. Kiểm tra theo Review Focus

| Review Focus | Kết quả review |
|---|---|
| Tiêu đề toàn khoảng trắng / quá dài | Đạt: trim rồi mới kiểm tra rỗng và giới hạn 200 |
| Kéo thả khi đang lọc | Đạt: reviewer đã tính tay các trường hợp, task bị ẩn không bị xáo trộn |
| localStorage hỏng / bị chặn | Đạt: không có đường nào dẫn tới màn hình trắng |
| Ranh giới ngày | Đạt: dùng giờ địa phương, an toàn qua cuối tháng/năm |
| Xóa nhãn/bảng còn tham chiếu | Đạt: không có `labelIds` mồ côi; xóa bảng cuối thì tạo lại bảng mới |

## 2. Lỗi đã sửa

Mỗi lỗi được sửa theo TDD: viết test tái hiện, xác nhận test FAIL, sửa code, xác nhận test PASS, chạy lại toàn bộ test.

| # | Mức | Lỗi | Test tái hiện | Cách sửa |
|---|---|---|---|---|
| 1 | Important | Hộp thoại “Tạo bảng mới” và “Xóa bảng?” nằm bên trong `<header>` có `backdrop-filter`, nên `position: fixed` bị bó theo header. Hộp thoại có thể bị đẩy ra khỏi màn hình (nhất là trên mobile) | `renders dialogs outside the blurred header` | `Modal` render qua `createPortal(…, document.body)`; màu nhấn được gắn thêm lên `<html data-accent>` để hộp thoại vẫn đúng màu (`keeps the accent color available to portalled dialogs`) |
| 2 | Important | Nhấn Esc trong hộp “Xóa công việc này?” đóng luôn hộp sửa công việc, mất phần đang sửa | `Escape in the delete confirmation closes only the confirmation` | Dùng một stack modal: chỉ modal trên cùng xử lý Esc/Tab |
| 3 | Important | Focus trap bị lọt khi có hai modal lồng nhau | `Tab stays inside the confirmation dialog` | Cùng cách sửa với #2 |
| 4 | Minor → **nâng lên Important** | Sau khi gặp dữ liệu hỏng, mỗi lần tải lại trang lại tạo thêm backup và hiện cảnh báo | `saves the fresh state so a second load neither warns nor backs up again` | Lưu ngay state mới sau khi backup thành công |
| 5 | Minor → **nâng lên Important** | `aria-label` trên thẻ ghi đè nội dung, trình đọc màn hình không đọc được ưu tiên/hạn chót/“quá hạn” | `a task card exposes priority and deadline to screen readers` | Bỏ `aria-label`, tên truy cập lấy từ nội dung thẻ |

Lý do nâng mức #4 và #5: đánh giá theo tác động thực tế lên người dùng. #4 làm người dùng thấy cảnh báo lặp lại
và localStorage đầy dần. #5 làm người dùng trình đọc màn hình mất thông tin chính của công việc.

Sau khi sửa: `npm run check` PASS (87/87), E2E 11/11 PASS. Trong E2E phải sửa 2 locator vì thẻ giờ có tên truy cập
đầy đủ và `data-accent` nằm thêm trên `<html>`.

## 3. Hoãn lại (Minor, chưa sửa — người dùng quyết định)

- `saveState` bỏ qua lỗi quota mà không báo cho người dùng.
- Không đồng bộ giữa nhiều tab: tab ghi sau sẽ đè dữ liệu của tab kia.
- Tab cột trên mobile chưa có `role="tabpanel"` và điều hướng bằng phím mũi tên; `MoveMenu` chưa hỗ trợ phím mũi tên.
- `today` chỉ được tính lại khi render: mở app qua nửa đêm thì chế độ Hôm nay chưa cập nhật cho tới lần tương tác tiếp theo.
- Sau khi xóa công việc, focus rơi về `body`.

## 4. Các quyết định (Ruling) trong quá trình triển khai

| Quyết định | Lý do | Rủi ro nếu sai |
|---|---|---|
| Không dùng git worktree, làm trên nhánh `claude/flowboard-mvp` của bản clone riêng | Repo mới, chỉ phục vụ dự án này | Thấp |
| Thêm giới hạn tên nhãn 30 ký tự và lỗi “Không tìm thấy công việc” | Spec không nêu | Thấp |
| `toFullIndex` nhận danh sách hiển thị **không gồm** task đang kéo | Khớp với cách dnd-kit báo vị trí thả | Thả sai vị trí; đã có unit test và E2E phủ |
| Store dùng `createStore` + `saveState` thủ công thay cho middleware `persist` | Cần kiểm soát việc backup và thông báo | Không đáng kể |
| Schema từ chối dữ liệu có cột trỏ tới task không tồn tại | Tránh crash khi dữ liệu bị chỉnh tay | Dữ liệu bị reset (có backup) nếu kiểm tra quá chặt |
| Chọn bảng bằng `<select>` gốc + nút “Bảng mới” + popover “Tùy chỉnh bảng” | Đơn giản, dễ dùng trên mobile, hỗ trợ a11y sẵn | Không đáng kể |
| Nhãn mới được thêm vào bảng ngay, kể cả khi bấm Hủy hộp thoại | Nhãn là dữ liệu cấp bảng | Có thể còn sót nhãn không dùng |
| `MouseSensor` + `TouchSensor` (nhấn giữ 200ms) thay cho `PointerSensor` | Giữ được thao tác cuộn trang trên điện thoại | Trên cảm ứng phải nhấn giữ mới kéo được |
| Toast dùng `role="alert"` | dnd-kit đã dùng `role="status"` | Không đáng kể |
| Thêm số đếm trên nút “Lọc (n)” | Rõ ràng hơn | Không đáng kể |
| Viết `columnKeyboardCoordinates` cho ←/→ | Mặc định của dnd-kit không chuyển cột (E2E phát hiện) | Không đáng kể |
