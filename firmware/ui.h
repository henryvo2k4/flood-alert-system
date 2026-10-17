#ifndef UI_H
#define UI_H

#ifdef __cplusplus
extern "C" {
#endif

#include "lvgl.h"
#include "weather_icons.h"

// ================= KHAI BÁO BIẾN GIAO DIỆN CHÍNH =================
extern lv_obj_t * ui_Screen1;
extern lv_obj_t * ui_img_bg;

// 6 Thẻ thông số nhỏ
extern lv_obj_t * ui_card_temp;
extern lv_obj_t * ui_lbl_temp_title;
extern lv_obj_t * ui_lbl_temp_val;

extern lv_obj_t * ui_card_hum;
extern lv_obj_t * ui_lbl_hum_title;
extern lv_obj_t * ui_lbl_hum_val;

extern lv_obj_t * ui_card_wind;
extern lv_obj_t * ui_lbl_wind_title;
extern lv_obj_t * ui_lbl_wind_val;

extern lv_obj_t * ui_card_press;
extern lv_obj_t * ui_lbl_press_title;
extern lv_obj_t * ui_lbl_press_val;

extern lv_obj_t * ui_card_water;
extern lv_obj_t * ui_lbl_water_title;
extern lv_obj_t * ui_lbl_water_val;

extern lv_obj_t * ui_card_weather;
extern lv_obj_t * ui_lbl_weather_title;
extern lv_obj_t * ui_img_weather_icon;  // Icon đồ họa thời tiết
extern lv_obj_t * ui_lbl_weather_sub;

// Thẻ trạng thái lớn dưới cùng
extern lv_obj_t * ui_card_status;
extern lv_obj_t * ui_lbl_status_main;
extern lv_obj_t * ui_lbl_status_sub;

// Lớp phủ cảnh báo nhấp nháy đỏ toàn màn hình
extern lv_obj_t * ui_overlay_alert;

// ================= CÁC HÀM ĐIỀU KHIỂN =================
void ui_init(void);

/**
 * @brief Cập nhật toàn bộ thông số lên giao diện TFT
 * @param flood_level Cấp độ ngập đã được xác nhận (0: Không cảnh báo, 1: Lụt nhẹ 20-50cm, 2: Lụt nặng >=50cm)
 */
void ui_update_data(float temp, float hum, float press, float wind, float water_level, float lux, int rain_status, int rain_analog, int flood_level);

#ifdef __cplusplus
} /*extern "C"*/
#endif

#endif // UI_H
