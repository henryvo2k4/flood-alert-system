#ifndef WEATHER_ICONS_H
#define WEATHER_ICONS_H

#ifdef __cplusplus
extern "C" {
#endif

#include "lvgl.h"

extern const lv_img_dsc_t icon_sun;        // Nắng gắt ☀️
extern const lv_img_dsc_t icon_sun_cloud;  // Nắng đẹp / Quang mây 🌤️
extern const lv_img_dsc_t icon_cloud;      // Râm mát / Âm u ☁️
extern const lv_img_dsc_t icon_rain;       // Mưa rào 🌦️
extern const lv_img_dsc_t icon_heavy_rain; // Mưa rất to 🌧️
extern const lv_img_dsc_t icon_storm;      // Bão giật / Sấm sét ⛈️

#ifdef __cplusplus
}
#endif

#endif // WEATHER_ICONS_H
