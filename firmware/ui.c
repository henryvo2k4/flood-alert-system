#include "ui.h"
#include <stdio.h>
#include <stdbool.h>
#include <math.h>

// ================= KHAI BÁO ẢNH NỀN GỐC =================
LV_IMG_DECLARE(nen_img);

// ================= CÁC BIẾN ĐỐI TƯỢNG WIDGET =================
lv_obj_t * ui_Screen1 = NULL;
lv_obj_t * ui_img_bg = NULL;

lv_obj_t * ui_card_temp = NULL;
lv_obj_t * ui_lbl_temp_title = NULL;
lv_obj_t * ui_lbl_temp_val = NULL;

lv_obj_t * ui_card_hum = NULL;
lv_obj_t * ui_lbl_hum_title = NULL;
lv_obj_t * ui_lbl_hum_val = NULL;

lv_obj_t * ui_card_wind = NULL;
lv_obj_t * ui_lbl_wind_title = NULL;
lv_obj_t * ui_lbl_wind_val = NULL;

lv_obj_t * ui_card_press = NULL;
lv_obj_t * ui_lbl_press_title = NULL;
lv_obj_t * ui_lbl_press_val = NULL;

lv_obj_t * ui_card_water = NULL;
lv_obj_t * ui_lbl_water_title = NULL;
lv_obj_t * ui_lbl_water_val = NULL;

lv_obj_t * ui_card_weather = NULL;
lv_obj_t * ui_lbl_weather_title = NULL;
lv_obj_t * ui_img_weather_icon = NULL; // Widget Image hiển thị Icon thời tiết
lv_obj_t * ui_lbl_weather_sub = NULL;

lv_obj_t * ui_card_status = NULL;
lv_obj_t * ui_lbl_status_main = NULL;
lv_obj_t * ui_lbl_status_sub = NULL;

lv_obj_t * ui_overlay_alert = NULL;

// Trạng thái nhấp nháy toàn màn hình
static bool is_critical_alert = false;
static bool blink_state = false;
static lv_timer_t * alert_timer = NULL;

// ================= HÀM HỖ TRỢ STYLE TÔ ĐỎ Ô =================
static void set_card_alert(lv_obj_t * card, bool alert) {
    if (!card) return;
    if (alert) {
        lv_obj_set_style_bg_color(card, lv_color_make(254, 226, 226), 0); // Đỏ nhạt
        lv_obj_set_style_bg_opa(card, LV_OPA_80, 0);
        lv_obj_set_style_border_color(card, lv_color_make(220, 38, 38), 0); // Viền đỏ đậm
        lv_obj_set_style_border_width(card, 2, 0);
        lv_obj_set_style_border_opa(card, LV_OPA_COVER, 0);
    } else {
        lv_obj_set_style_bg_opa(card, LV_OPA_0, 0); // Trong suốt để lộ nền gốc
        lv_obj_set_style_border_width(card, 0, 0);
        lv_obj_set_style_border_opa(card, LV_OPA_0, 0);
    }
}

// Timer 500ms nhấp nháy đỏ toàn màn hình
static void alert_blink_timer_cb(lv_timer_t * timer) {
    LV_UNUSED(timer);
    if (!ui_overlay_alert) return;

    if (is_critical_alert) {
        lv_obj_clear_flag(ui_overlay_alert, LV_OBJ_FLAG_HIDDEN);
        blink_state = !blink_state;
        if (blink_state) {
            lv_obj_set_style_bg_opa(ui_overlay_alert, LV_OPA_40, 0);
            lv_obj_set_style_border_opa(ui_overlay_alert, LV_OPA_COVER, 0);
        } else {
            lv_obj_set_style_bg_opa(ui_overlay_alert, LV_OPA_0, 0);
            lv_obj_set_style_border_opa(ui_overlay_alert, LV_OPA_0, 0);
        }
    } else {
        // Khi không báo động, ẩn hoàn toàn lớp phủ để không ảnh hưởng đến màn hình
        lv_obj_add_flag(ui_overlay_alert, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_style_bg_opa(ui_overlay_alert, LV_OPA_0, 0);
        lv_obj_set_style_border_opa(ui_overlay_alert, LV_OPA_0, 0);
    }
}

// Tạo card chuẩn phủ lên từng ô của ảnh nền
static lv_obj_t * create_card(lv_obj_t * parent, int32_t x, int32_t y, int32_t w, int32_t h) {
    lv_obj_t * card = lv_obj_create(parent);
    lv_obj_set_pos(card, x, y);
    lv_obj_set_size(card, w, h);
    lv_obj_set_style_radius(card, 8, 0);
    lv_obj_set_style_bg_opa(card, LV_OPA_0, 0); // Mặc định trong suốt để nhìn thấy nền trắng của ảnh
    lv_obj_set_style_border_width(card, 0, 0);
    lv_obj_set_style_pad_all(card, 0, 0);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    return card;
}

// ================= KHỞI TẠO TOÀN BỘ GIAO DIỆN =================
void ui_init(void) {
    // 1. Tạo màn hình chính
    ui_Screen1 = lv_obj_create(NULL);
    lv_obj_clear_flag(ui_Screen1, LV_OBJ_FLAG_SCROLLABLE);

    // 2. Ảnh nền 320x240
    ui_img_bg = lv_img_create(ui_Screen1);
    lv_img_set_src(ui_img_bg, &nen_img);
    lv_obj_set_pos(ui_img_bg, 0, 0);
    lv_obj_set_size(ui_img_bg, 320, 240);

    // Màu chữ tiêu đề: Xanh dương đậm sắc nét
    lv_color_t color_title = lv_color_make(15, 60, 110);

    // --- Ô 1: NHIỆT ĐỘ (X=9, Y=11, W=96, H=62) ---
    ui_card_temp = create_card(ui_Screen1, 9, 11, 96, 62);
    ui_lbl_temp_title = lv_label_create(ui_card_temp);
    lv_label_set_text(ui_lbl_temp_title, "NHIET DO");
    lv_obj_set_style_text_color(ui_lbl_temp_title, color_title, 0);
    lv_obj_set_style_text_font(ui_lbl_temp_title, &lv_font_montserrat_12, 0);
    lv_obj_align(ui_lbl_temp_title, LV_ALIGN_TOP_MID, 0, 4);

    ui_lbl_temp_val = lv_label_create(ui_card_temp);
    lv_label_set_text(ui_lbl_temp_val, "--.- \xC2\xB0" "C");
    lv_obj_set_style_text_color(ui_lbl_temp_val, lv_color_make(220, 38, 38), 0); // Đỏ nổi bật
    lv_obj_set_style_text_font(ui_lbl_temp_val, &lv_font_montserrat_16, 0);
    lv_obj_align(ui_lbl_temp_val, LV_ALIGN_CENTER, 0, 10);

    // --- Ô 2: ĐỘ ẨM (X=110, Y=11, W=98, H=62) ---
    ui_card_hum = create_card(ui_Screen1, 110, 11, 98, 62);
    ui_lbl_hum_title = lv_label_create(ui_card_hum);
    lv_label_set_text(ui_lbl_hum_title, "DO AM");
    lv_obj_set_style_text_color(ui_lbl_hum_title, color_title, 0);
    lv_obj_set_style_text_font(ui_lbl_hum_title, &lv_font_montserrat_12, 0);
    lv_obj_align(ui_lbl_hum_title, LV_ALIGN_TOP_MID, 0, 4);

    ui_lbl_hum_val = lv_label_create(ui_card_hum);
    lv_label_set_text(ui_lbl_hum_val, "-- %");
    lv_obj_set_style_text_color(ui_lbl_hum_val, lv_color_make(2, 132, 199), 0); // Xanh dương
    lv_obj_set_style_text_font(ui_lbl_hum_val, &lv_font_montserrat_16, 0);
    lv_obj_align(ui_lbl_hum_val, LV_ALIGN_CENTER, 0, 10);

    // --- Ô 3: TỐC ĐỘ GIÓ (X=215, Y=11, W=96, H=62) ---
    ui_card_wind = create_card(ui_Screen1, 215, 11, 96, 62);
    ui_lbl_wind_title = lv_label_create(ui_card_wind);
    lv_label_set_text(ui_lbl_wind_title, "SUC GIO");
    lv_obj_set_style_text_color(ui_lbl_wind_title, color_title, 0);
    lv_obj_set_style_text_font(ui_lbl_wind_title, &lv_font_montserrat_12, 0);
    lv_obj_align(ui_lbl_wind_title, LV_ALIGN_TOP_MID, 0, 4);

    ui_lbl_wind_val = lv_label_create(ui_card_wind);
    lv_label_set_text(ui_lbl_wind_val, "-.- m/s");
    lv_obj_set_style_text_color(ui_lbl_wind_val, lv_color_make(217, 119, 6), 0); // Cam
    lv_obj_set_style_text_font(ui_lbl_wind_val, &lv_font_montserrat_16, 0);
    lv_obj_align(ui_lbl_wind_val, LV_ALIGN_CENTER, 0, 10);

    // --- Ô 4: ÁP SUẤT (X=9, Y=78, W=96, H=62) ---
    ui_card_press = create_card(ui_Screen1, 9, 78, 96, 62);
    ui_lbl_press_title = lv_label_create(ui_card_press);
    lv_label_set_text(ui_lbl_press_title, "AP SUAT");
    lv_obj_set_style_text_color(ui_lbl_press_title, color_title, 0);
    lv_obj_set_style_text_font(ui_lbl_press_title, &lv_font_montserrat_12, 0);
    lv_obj_align(ui_lbl_press_title, LV_ALIGN_TOP_MID, 0, 4);

    ui_lbl_press_val = lv_label_create(ui_card_press);
    lv_label_set_text(ui_lbl_press_val, "----.- hPa");
    lv_obj_set_style_text_color(ui_lbl_press_val, lv_color_make(79, 70, 229), 0); // Tím Indigo
    lv_obj_set_style_text_font(ui_lbl_press_val, &lv_font_montserrat_14, 0);
    lv_obj_align(ui_lbl_press_val, LV_ALIGN_CENTER, 0, 10);

    // --- Ô 5: MỰC NƯỚC NGẬP (X=110, Y=78, W=98, H=62) ---
    ui_card_water = create_card(ui_Screen1, 110, 78, 98, 62);
    ui_lbl_water_title = lv_label_create(ui_card_water);
    lv_label_set_text(ui_lbl_water_title, "MUC NGAP");
    lv_obj_set_style_text_color(ui_lbl_water_title, color_title, 0);
    lv_obj_set_style_text_font(ui_lbl_water_title, &lv_font_montserrat_12, 0);
    lv_obj_align(ui_lbl_water_title, LV_ALIGN_TOP_MID, 0, 4);

    ui_lbl_water_val = lv_label_create(ui_card_water);
    lv_label_set_text(ui_lbl_water_val, "--.- cm");
    lv_obj_set_style_text_color(ui_lbl_water_val, lv_color_make(13, 148, 136), 0); // Teal
    lv_obj_set_style_text_font(ui_lbl_water_val, &lv_font_montserrat_16, 0);
    lv_obj_align(ui_lbl_water_val, LV_ALIGN_CENTER, 0, 10);

    // --- Ô 6: THỜI TIẾT DẠNG ICON ĐỒ HỌA (X=215, Y=78, W=96, H=62) ---
    ui_card_weather = create_card(ui_Screen1, 215, 78, 96, 62);
    ui_lbl_weather_title = lv_label_create(ui_card_weather);
    lv_label_set_text(ui_lbl_weather_title, "THOI TIET");
    lv_obj_set_style_text_color(ui_lbl_weather_title, color_title, 0);
    lv_obj_set_style_text_font(ui_lbl_weather_title, &lv_font_montserrat_12, 0);
    lv_obj_align(ui_lbl_weather_title, LV_ALIGN_TOP_MID, 0, 3);

    // Widget hiển thị Icon thời tiết (Mặc định icon Nắng đẹp)
    ui_img_weather_icon = lv_img_create(ui_card_weather);
    lv_img_set_src(ui_img_weather_icon, &icon_sun_cloud);
    lv_obj_align(ui_img_weather_icon, LV_ALIGN_CENTER, 0, 4);

    ui_lbl_weather_sub = lv_label_create(ui_card_weather);
    lv_label_set_text(ui_lbl_weather_sub, "-- lx");
    lv_obj_set_style_text_color(ui_lbl_weather_sub, lv_color_make(100, 116, 139), 0);
#if LV_FONT_MONTSERRAT_10
    lv_obj_set_style_text_font(ui_lbl_weather_sub, &lv_font_montserrat_10, 0);
#else
    lv_obj_set_style_text_font(ui_lbl_weather_sub, &lv_font_montserrat_12, 0);
#endif
    lv_obj_align(ui_lbl_weather_sub, LV_ALIGN_BOTTOM_MID, 0, -2);

    // --- Ô 7: THẺ TRẠNG THÁI LỚN DƯỚI CÙNG (X=9, Y=145, W=302, H=79) ---
    ui_card_status = create_card(ui_Screen1, 9, 145, 302, 79);
    ui_lbl_status_main = lv_label_create(ui_card_status);
    lv_label_set_text(ui_lbl_status_main, "HE THONG HOAT DONG ON DINH");
    lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(5, 150, 105), 0); // Xanh lá
    lv_obj_set_style_text_font(ui_lbl_status_main, &lv_font_montserrat_14, 0);
    lv_obj_align(ui_lbl_status_main, LV_ALIGN_TOP_MID, 0, 8);

    ui_lbl_status_sub = lv_label_create(ui_card_status);
    lv_label_set_text(ui_lbl_status_sub, "Cac chi so moi truong trong gioi han an toan.");
    lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(71, 85, 105), 0);
    lv_obj_set_style_text_font(ui_lbl_status_sub, &lv_font_montserrat_12, 0);
    lv_obj_set_width(ui_lbl_status_sub, 280);
    lv_label_set_long_mode(ui_lbl_status_sub, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(ui_lbl_status_sub, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(ui_lbl_status_sub, LV_ALIGN_BOTTOM_MID, 0, -8);

    // --- LỚP PHỦ NHẤP NHÁY ĐỎ TOÀN MÀN HÌNH ---
    ui_overlay_alert = lv_obj_create(ui_Screen1);
    lv_obj_set_pos(ui_overlay_alert, 0, 0);
    lv_obj_set_size(ui_overlay_alert, 320, 240);
    lv_obj_set_style_bg_color(ui_overlay_alert, lv_color_make(239, 68, 68), 0);
    lv_obj_set_style_bg_opa(ui_overlay_alert, LV_OPA_0, 0);
    lv_obj_set_style_border_color(ui_overlay_alert, lv_color_make(185, 28, 28), 0);
    lv_obj_set_style_border_width(ui_overlay_alert, 6, 0);
    lv_obj_set_style_border_opa(ui_overlay_alert, LV_OPA_0, 0);
    lv_obj_clear_flag(ui_overlay_alert, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(ui_overlay_alert, LV_OBJ_FLAG_HIDDEN); // Ẩn mặc định

    // Tạo timer 500ms nháy cảnh báo
    if (!alert_timer) {
        alert_timer = lv_timer_create(alert_blink_timer_cb, 500, NULL);
    }

    // Tải màn hình
    lv_scr_load(ui_Screen1);
}

// ================= CẬP NHẬT DỮ LIỆU ĐỘNG & BỘ NÃO CẢNH BÁO =================
void ui_update_data(float temp, float hum, float press, float wind, float water_level, float lux, int rain_status, int rain_analog, int flood_level) {
    if (!ui_Screen1) return;

    char str_buf[64];

    // 1. Cập nhật Nhiệt độ (quy đồng 1 số sau dấu phẩy, kí hiệu °C chuẩn)
    if (isnan(temp)) {
        lv_label_set_text(ui_lbl_temp_val, "--.- \xC2\xB0" "C");
        set_card_alert(ui_card_temp, false);
    } else {
        snprintf(str_buf, sizeof(str_buf), "%.1f \xC2\xB0" "C", temp);
        lv_label_set_text(ui_lbl_temp_val, str_buf);
        bool alert_temp = (temp > 38.0f || temp < 12.0f);
        set_card_alert(ui_card_temp, alert_temp);
    }

    // 2. Cập nhật Độ ẩm (quy đồng 1 số sau dấu phẩy)
    if (isnan(hum)) {
        lv_label_set_text(ui_lbl_hum_val, "--.- %");
        set_card_alert(ui_card_hum, false);
    } else {
        snprintf(str_buf, sizeof(str_buf), "%.1f %%", hum);
        lv_label_set_text(ui_lbl_hum_val, str_buf);
        bool alert_hum = (hum > 90.0f);
        set_card_alert(ui_card_hum, alert_hum);
    }

    // 3. Cập nhật Tốc độ gió (quy đồng 1 số sau dấu phẩy)
    if (isnan(wind) || wind < 0.0f) {
        lv_label_set_text(ui_lbl_wind_val, "0.0 m/s");
        set_card_alert(ui_card_wind, false);
    } else {
        snprintf(str_buf, sizeof(str_buf), "%.1f m/s", wind);
        lv_label_set_text(ui_lbl_wind_val, str_buf);
        bool alert_wind = (wind > 10.0f);
        set_card_alert(ui_card_wind, alert_wind);
    }

    // 4. Cập nhật Áp suất (quy đồng 1 số sau dấu phẩy)
    if (isnan(press)) {
        lv_label_set_text(ui_lbl_press_val, "----.- hPa");
        set_card_alert(ui_card_press, false);
    } else {
        snprintf(str_buf, sizeof(str_buf), "%.1f hPa", press);
        lv_label_set_text(ui_lbl_press_val, str_buf);
        bool alert_press = (press < 995.0f && press > 800.0f);
        set_card_alert(ui_card_press, alert_press);
    }

    // 5. Cập nhật Mực nước ngập (quy đồng 1 số sau dấu phẩy, cảnh báo khi flood_level >= 1)
    if (isnan(water_level) || water_level < 0.0f) {
        lv_label_set_text(ui_lbl_water_val, "Loi");
        set_card_alert(ui_card_water, true);
    } else {
        snprintf(str_buf, sizeof(str_buf), "%.1f cm", water_level);
        lv_label_set_text(ui_lbl_water_val, str_buf);
        // Chỉ tô đỏ cảnh báo khi độ lụt >= 20cm đã được xác nhận ổn định qua 15s (flood_level >= 1)
        bool alert_water = (flood_level >= 1);
        set_card_alert(ui_card_water, alert_water);
    }

    // 6. Cập nhật ICON THỜI TIẾT ĐỒ HỌA
    bool alert_weather = false;
    if (rain_status == 0) { // Đang mưa
        if (wind > 15.0f) {
            lv_img_set_src(ui_img_weather_icon, &icon_storm); // Icon Bão sét
            snprintf(str_buf, sizeof(str_buf), "Bao %.1fm/s", wind);
            lv_label_set_text(ui_lbl_weather_sub, str_buf);
            alert_weather = true;
        } else if (rain_analog < 1500) {
            lv_img_set_src(ui_img_weather_icon, &icon_heavy_rain); // Icon Mưa rất to
            lv_label_set_text(ui_lbl_weather_sub, "Mua to");
            alert_weather = true;
        } else {
            lv_img_set_src(ui_img_weather_icon, &icon_rain); // Icon Mưa rào
            lv_label_set_text(ui_lbl_weather_sub, "Mua rao");
            alert_weather = false;
        }
    } else { // Tạnh ráo
        if (lux > 35000.0f) {
            lv_img_set_src(ui_img_weather_icon, &icon_sun); // Icon Mặt trời Nắng gắt
            snprintf(str_buf, sizeof(str_buf), "%.0flx Nang", lux);
            lv_label_set_text(ui_lbl_weather_sub, str_buf);
            alert_weather = (!isnan(temp) && temp > 37.0f);
        } else if (lux > 10000.0f) {
            lv_img_set_src(ui_img_weather_icon, &icon_sun_cloud); // Icon Nắng đẹp quang mây
            snprintf(str_buf, sizeof(str_buf), "%.0flx", lux);
            lv_label_set_text(ui_lbl_weather_sub, str_buf);
            alert_weather = false;
        } else {
            lv_img_set_src(ui_img_weather_icon, &icon_cloud); // Icon Râm mát
            snprintf(str_buf, sizeof(str_buf), "%.0flx Ram", lux);
            lv_label_set_text(ui_lbl_weather_sub, str_buf);
            alert_weather = false;
        }
    }
    set_card_alert(ui_card_weather, alert_weather);

    // 7. Cập nhật Thẻ Trạng thái lớn & Quyết định nhấp nháy đỏ toàn màn hình
    // PHÂN CẤP MỨC NGẬP: 
    // Cấp 0: Không có cảnh báo (< 20 cm)
    // Cấp 1: Cảnh báo lụt nhẹ (20 - 50 cm)
    // Cấp 2: Cảnh báo lụt nặng (>= 50 cm) -> Kích hoạt nhấp nháy đỏ toàn màn hình
    if (flood_level >= 2) {
        // Cấp 2: CẢNH BÁO LỤT NẶNG (>= 50 cm) -> KÍCH HOẠT NHẤP NHÁY ĐỎ TOÀN MÀN HÌNH
        is_critical_alert = true;
        set_card_alert(ui_card_status, true);
        lv_label_set_text(ui_lbl_status_main, "CANH BAO: LUT NANG (>= 50cm)!");
        lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(185, 28, 28), 0); // Đỏ đậm
        snprintf(str_buf, sizeof(str_buf), "Do lut %.1f cm. Nuoc ngap sau nguy hiem! CHU Y SO TAN!", water_level);
        lv_label_set_text(ui_lbl_status_sub, str_buf);
        lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(153, 27, 27), 0);
    }
    else if (flood_level == 1) {
        // Cấp 1: CẢNH BÁO LỤT NHẸ (20 - 50 cm)
        is_critical_alert = false;
        set_card_alert(ui_card_status, true);
        lv_label_set_text(ui_lbl_status_main, "CANH BAO: LUT NHE (20 - 50cm)");
        lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(217, 119, 6), 0); // Vàng cam
        snprintf(str_buf, sizeof(str_buf), "Do lut %.1f cm. Nuoc ngap nhe, chu y khi di chuyen.", water_level);
        lv_label_set_text(ui_lbl_status_sub, str_buf);
        lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(68, 64, 60), 0);
    }
    else if (wind > 15.0f && rain_status == 0) {
        is_critical_alert = true;
        set_card_alert(ui_card_status, true);
        lv_label_set_text(ui_lbl_status_main, "CANH BAO GIO BAO NGUY HIEM!");
        lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(185, 28, 28), 0);
        lv_label_set_text(ui_lbl_status_sub, "Tranh xa cay to, bien quang cao, vung xung yeu!");
        lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(153, 27, 27), 0);
    }
    else if (rain_status == 0 && rain_analog < 1500) {
        is_critical_alert = false;
        set_card_alert(ui_card_status, false);
        lv_label_set_text(ui_lbl_status_main, "MUA TO - NGUY CO NGAP CUC BO");
        lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(29, 78, 216), 0);
        lv_label_set_text(ui_lbl_status_sub, "Tam nhin han che, chu y nap cong thoat nuoc.");
        lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(30, 41, 59), 0);
    }
    else if (rain_status == 0) {
        is_critical_alert = false;
        set_card_alert(ui_card_status, false);
        lv_label_set_text(ui_lbl_status_main, "DANG CO MUA - DUONG TRON TRUOT");
        lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(2, 132, 199), 0);
        lv_label_set_text(ui_lbl_status_sub, "Giam toc do khi di chuyen, giu khoang cach an toan.");
        lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(30, 41, 59), 0);
    }
    else if (wind > 10.0f) {
        is_critical_alert = false;
        set_card_alert(ui_card_status, false);
        lv_label_set_text(ui_lbl_status_main, "CANH GIAC GIO GIAT MANH");
        lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(194, 65, 12), 0);
        lv_label_set_text(ui_lbl_status_sub, "Chu y vat roi tren cao, han che di chuyen.");
        lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(30, 41, 59), 0);
    }
    else {
        is_critical_alert = false;
        set_card_alert(ui_card_status, false);
        lv_label_set_text(ui_lbl_status_main, "HE THONG HOAT DONG ON DINH");
        lv_obj_set_style_text_color(ui_lbl_status_main, lv_color_make(5, 150, 105), 0);
        lv_label_set_text(ui_lbl_status_sub, "Cac chi so moi truong trong gioi han an toan.");
        lv_obj_set_style_text_color(ui_lbl_status_sub, lv_color_make(71, 85, 105), 0);
    }
}
