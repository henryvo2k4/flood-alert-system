#include <Wire.h>
#include <SPI.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <lvgl.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include "ui.h"

// ================= CẤU HÌNH WI-FI MẶC ĐỊNH & SUPABASE =================
const char* DEFAULT_WIFI_SSID = "Double Tea";
const char* DEFAULT_WIFI_PASS = "13011998";

// Tên điểm phát Wi-Fi AP khi không kết nối được mạng
const char* AP_SSID = "FLOOD_STATION_CONFIG";
const char* AP_PASS = ""; // Không đặt mật khẩu để người dùng dễ kết nối

// Supabase REST API & Xác thực (đồng bộ với Web Dashboard)
const char* SUPABASE_URL      = "https://wedkvootboydtfmunpya.supabase.co/rest/v1/sensor_logs";
const char* SUPABASE_ANON_KEY = "sb_publishable_ChKwxPdzzT0xCIxZ68yIxA_HE5zsDaJ";
const char* STATION_ID        = "c518805a-efa1-4a0b-a4e9-e45b3cc993ef";

// ================= CẤU HÌNH CHÂN PHẦN CỨNG =================
#define RAIN_DO   32
#define RAIN_AO   33
#define TRIG_PIN  5
#define ECHO_PIN  19
#define WIND_PIN  34 

// Chiều cao cảm biến siêu âm cách đáy đường / lòng sông (100 cm = 1 mét)
const float SENSOR_MOUNT_HEIGHT_CM = 100.0;
const float WIND_DIVIDER_RATIO = 20000.0 / (10000.0 + 20000.0);

// ================= KHỞI TẠO CÁC ĐỐI TƯỢNG =================
TFT_eSPI tft = TFT_eSPI();
Adafruit_BME280 bme; 
BH1750 lightMeter;
Preferences preferences;
WebServer server(80);
DNSServer dnsServer;

// Buffer vẽ đồ họa cho thư viện LVGL
static const uint16_t screenWidth  = 320;
static const uint16_t screenHeight = 240;
static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf[ screenWidth * 10 ];

// Các biến lưu giá trị cảm biến
float temp = 0.0, hum = 0.0, press = 0.0, lux = 0.0;
int rainDigital = 1, rainAnalog = 4095;
float rawDistanceCm = 0.0;
float waterLevelCm = 0.0;
float windSpeed = 0.0;

// Trạng thái hệ thống & Bộ lọc xác thực 15 giây
bool isConfigPortalActive = false;
unsigned long prevSensorReadTime = 0;
const unsigned long INTERVAL_SENSOR_READ = 1000; // Đọc cảm biến mỗi 1s để liên tục kiểm tra tính ổn định

// Đồng bộ độ lụt thủ công từ Web (khi cảm biến siêu âm gặp sự cố)
float manualTargetWaterLevel = -1.0f; // -1: chưa có lệnh thủ công từ Web, >= 0: đang dùng mức lụt từ Web
unsigned long prevTargetFetchTime = 0;
const unsigned long INTERVAL_TARGET_FETCH = 2000; // Kiểm tra lệnh từ Web mỗi 2 giây

unsigned long prevSupabasePostTime = 0;
const unsigned long INTERVAL_SUPABASE_POST = 4000; // Gửi lên Supabase định kỳ mỗi 4s để Web cập nhật mượt mà

// ================= BỘ LỌC XÁC THỰC ỔN ĐỊNH TRONG 15 GIÂY =================
// Cấp 0: Không cảnh báo (<20cm), Cấp 1: Cảnh báo lụt nhẹ (20-50cm), Cấp 2: Cảnh báo lụt nặng (>=50cm)
int confirmedFloodLevel = 0;
int candidateFloodLevel = 0;
unsigned long candidateStartTime = 0;
const unsigned long STABILITY_WINDOW_MS = 15000; // Duy trì liên tục đúng 15 giây mới xác nhận và gửi cảnh báo

float smoothedWaterLevel = 0.0;
bool waterLevelInitialized = false;

// ================= HÀM XUẤT BUFFER LVGL RA MÀN HÌNH TFT =================
void my_disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color_p) {
    uint32_t w = (area->x2 - area->x1 + 1);
    uint32_t h = (area->y2 - area->y1 + 1);

    tft.startWrite();
    tft.setAddrWindow(area->x1, area->y1, w, h);
    tft.pushColors((uint16_t *)&color_p->full, w * h, true);
    tft.endWrite();

    lv_disp_flush_ready(disp);
}

// ================= GIAO DIỆN MÀN HÌNH TFT CHO KHÂU KẾT NỐI WI-FI =================
void drawWifiConnectingScreen(String ssid, int timeLeft) {
    tft.fillScreen(0x18E3); // Xanh đen công nghệ
    tft.drawRoundRect(8, 8, 304, 224, 10, 0x0359);
    
    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(0xFFFF, 0x18E3);
    tft.setTextFont(4);
    tft.drawString("FLOOD ALERT STATION", 160, 20);

    tft.setTextFont(2);
    tft.setTextColor(0x7BEF, 0x18E3);
    tft.drawString("DANG KET NOI WI-FI...", 160, 60);

    tft.fillRoundRect(25, 90, 270, 50, 8, 0x2126);
    tft.setTextColor(0x07E0, 0x2126); // Xanh lá
    tft.drawString(ssid, 160, 105);

    tft.setTextColor(0xFD20, 0x18E3); // Vàng cam
    String status = "Dang thu ket noi... (" + String(timeLeft) + "s)";
    tft.drawString(status, 160, 160);

    tft.setTextColor(0x9CD3, 0x18E3);
    tft.drawString("Tu dong bat AP Config neu that bai", 160, 195);
}

void drawWifiConfigScreen() {
    tft.fillScreen(0x10A2); // Nền tối
    tft.drawRoundRect(6, 6, 308, 228, 10, 0xFC00);
    tft.drawRoundRect(7, 7, 306, 226, 9, 0xFC00);

    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(0xFC00, 0x10A2); // Cam đậm
    tft.setTextFont(4);
    tft.drawString("CHE DO CAU HINH WI-FI", 160, 15);

    tft.setTextFont(2);
    tft.setTextColor(0xFFFF, 0x10A2);
    tft.drawString("Khong the ket noi mang da luu!", 160, 48);

    tft.fillRoundRect(15, 75, 290, 125, 8, 0x2126);

    tft.setTextDatum(TL_DATUM);
    tft.setTextColor(0x7BEF, 0x2126);
    tft.drawString("1. Dung dien thoai ket noi vao Wi-Fi:", 25, 85);
    tft.setTextColor(0x07E0, 0x2126);
    tft.drawString("   >> " + String(AP_SSID), 25, 105);

    tft.setTextColor(0x7BEF, 0x2126);
    tft.drawString("2. Mo trinh duyet truy cap dia chi:", 25, 130);
    tft.setTextColor(0x07FF, 0x2126);
    tft.drawString("   >> 192.168.4.1", 25, 150);

    tft.setTextColor(0xFD20, 0x2126);
    tft.drawString("3. Chon mang va nhap mat khau moi", 25, 175);

    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(0x9CD3, 0x10A2);
    tft.drawString("Dang cho nguoi dung cau hinh...", 160, 210);
}

void drawWifiSuccessScreen(String ipStr) {
    tft.fillScreen(0x02E5); // Xanh lá thành công
    tft.drawRoundRect(8, 8, 304, 224, 10, 0x07E0);

    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(0xFFFF, 0x02E5);
    tft.setTextFont(4);
    tft.drawString("DA KET NOI WI-FI!", 160, 45);

    tft.setTextFont(2);
    tft.drawString("Dia chi IP cua tram:", 160, 95);

    tft.setTextColor(0x07E0, 0x02E5);
    tft.setTextFont(4);
    tft.drawString(ipStr, 160, 125);

    tft.setTextColor(0xFFFF, 0x02E5);
    tft.setTextFont(2);
    tft.drawString("Dang khoi chay giao dien quan trac...", 160, 180);
}

// ================= GIAO DIỆN WEB CAPTIVE PORTAL (192.168.4.1) =================
String buildWebPage() {
    int n = WiFi.scanNetworks();
    String wifiListHtml = "";
    for (int i = 0; i < n; ++i) {
        String ssid = WiFi.SSID(i);
        int rssi = WiFi.RSSI(i);
        if (ssid.length() > 0) {
            wifiListHtml += "<option value='" + ssid + "'>" + ssid + " (" + String(rssi) + " dBm)</option>";
        }
    }

    String html = "<!DOCTYPE html><html lang='vi'><head><meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
        "<title>Tram Quan Trac Mua Lu - Cau Hinh Wi-Fi</title>"
        "<style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:20px;display:flex;justify-content:center;align-items:center;min-height:100vh;box-sizing:border-box;}"
        ".card{background:#1e293b;border-radius:16px;padding:24px;width:100%;max-width:420px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #334155;}"
        "h2{color:#38bdf8;margin-top:0;font-size:22px;text-align:center;}"
        "p{color:#94a3b8;font-size:14px;text-align:center;margin-bottom:20px;}"
        "label{display:block;margin-top:14px;color:#cbd5e1;font-weight:600;font-size:13px;}"
        "select,input{width:100%;padding:12px;margin-top:6px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:15px;box-sizing:border-box;outline:none;}"
        "select:focus,input:focus{border-color:#38bdf8;}"
        "button{width:100%;padding:14px;margin-top:24px;border:none;border-radius:8px;background:#0284c7;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;}"
        "button:hover{background:#0369a1;}"
        ".tip{font-size:12px;color:#64748b;margin-top:16px;text-align:center;}"
        "</style></head><body>"
        "<div class='card'>"
        "<h2>TRAM QUAN TRAC MUA LU</h2>"
        "<p>Vui long chon mang Wi-Fi va nhap mat khau de tram gui du lieu len Web Dashboard.</p>"
        "<form action='/save' method='POST'>"
        "<label for='ssid_select'>Mang Wi-Fi tim thay:</label>"
        "<select id='ssid_select' onchange='document.getElementById(\"ssid_input\").value=this.value;'>"
        "<option value=''>-- Chon Wi-Fi tu danh sach --</option>" + wifiListHtml +
        "</select>"
        "<label for='ssid_input'>Hoac tu nhap ten Wi-Fi (SSID):</label>"
        "<input type='text' id='ssid_input' name='ssid' placeholder='Nhap ten Wi-Fi...' required>"
        "<label for='password'>Mat khau Wi-Fi:</label>"
        "<input type='password' id='password' name='password' placeholder='Nhap mat khau...'>"
        "<button type='submit'>LUU VA KET NOI</button>"
        "</form>"
        "<div class='tip'>Sau khi bam Luu, tram se tu dong khoi dong lai de ket noi.</div>"
        "</div></body></html>";
    return html;
}

void startConfigPortal() {
    isConfigPortalActive = true;
    Serial.println("\n[AP Config] Khoi dong Access Point Captive Portal...");
    
    WiFi.disconnect();
    delay(100);
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);

    IPAddress apIP(192, 168, 4, 1);
    WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));

    drawWifiConfigScreen();

    dnsServer.start(53, "*", apIP);

    server.on("/", HTTP_GET, []() {
        server.send(200, "text/html", buildWebPage());
    });

    server.on("/save", HTTP_POST, []() {
        String new_ssid = server.arg("ssid");
        String new_pass = server.arg("password");

        if (new_ssid.length() > 0) {
            preferences.begin("flood_wifi", false);
            preferences.putString("ssid", new_ssid);
            preferences.putString("pass", new_pass);
            preferences.end();

            String successHtml = "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
                "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                "<title>Da Luu!</title><style>body{background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;padding:50px 20px;}"
                ".box{background:#1e293b;padding:30px;border-radius:16px;max-width:380px;margin:auto;border:1px solid #22c55e;}</style></head>"
                "<body><div class='box'><h2 style='color:#22c55e;'>DA LUU CAU HINH!</h2>"
                "<p>Tram dang khoi dong lai de ket noi vao mang: <b>" + new_ssid + "</b></p></div></body></html>";
            server.send(200, "text/html", successHtml);

            tft.fillScreen(0x02E5);
            tft.setTextDatum(TC_DATUM);
            tft.setTextColor(0xFFFF, 0x02E5);
            tft.setTextFont(4);
            tft.drawString("DA NHAN WI-FI MOI!", 160, 50);
            tft.setTextFont(2);
            tft.drawString("Mang: " + new_ssid, 160, 100);
            tft.drawString("Dang khoi dong lai sau 2 giay...", 160, 140);

            delay(2000);
            ESP.restart();
        } else {
            server.send(400, "text/plain", "Loi: Ten Wi-Fi khong duoc de trong!");
        }
    });

    server.onNotFound([]() {
        server.send(200, "text/html", buildWebPage());
    });

    server.begin();
    Serial.println("[AP Config] Web Server da san sang tai http://192.168.4.1");
}

bool attemptConnectWiFi() {
    preferences.begin("flood_wifi", true);
    String ssid = preferences.getString("ssid", DEFAULT_WIFI_SSID);
    String pass = preferences.getString("pass", DEFAULT_WIFI_PASS);
    preferences.end();

    Serial.print("\n[WiFi] Dang thu ket noi vao mang: ");
    Serial.println(ssid);

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());

    for (int sec = 15; sec > 0; sec--) {
        drawWifiConnectingScreen(ssid, sec);
        for (int i = 0; i < 10; i++) {
            if (WiFi.status() == WL_CONNECTED) {
                Serial.println("\n[WiFi] Ket noi thanh cong!");
                Serial.print("[WiFi] Dia chi IP: ");
                Serial.println(WiFi.localIP());

                drawWifiSuccessScreen(WiFi.localIP().toString());
                delay(1500);
                return true;
            }
            delay(100);
        }
    }

    Serial.println("\n[WiFi] Ket noi that bai sau 15 giay!");
    return false;
}

// Hàm đo khoảng cách siêu âm: 5 mẫu + Median + khoảng nghỉ 60 ms
// Trả về -1.0 nếu không nhận được Echo hợp lệ.
float readUltrasonicMedian() {
    const int NUM_SAMPLES = 5;
    float samples[NUM_SAMPLES];
    int validCount = 0;

    for (int i = 0; i < NUM_SAMPLES; i++) {
        // Trigger 10 us
        digitalWrite(TRIG_PIN, LOW);
        delayMicroseconds(5);

        digitalWrite(TRIG_PIN, HIGH);
        delayMicroseconds(10);

        digitalWrite(TRIG_PIN, LOW);

        // Timeout 40 ms
        unsigned long duration = pulseIn(ECHO_PIN, HIGH, 40000UL);

        if (duration > 0) {
            float distance = duration * 0.0343f / 2.0f;

            // Giới hạn hợp lý của phép đo
            if (distance >= 2.0f && distance <= 400.0f) {
                samples[validCount++] = distance;
            }
        }

        // Không trigger quá sát nhau, giảm nhiễu/echo chồng lấn
        delay(60);
    }

    if (validCount == 0) {
        return -1.0f;
    }

    // Sắp xếp để lấy Median
    for (int i = 0; i < validCount - 1; i++) {
        for (int j = i + 1; j < validCount; j++) {
            if (samples[i] > samples[j]) {
                float tmp = samples[i];
                samples[i] = samples[j];
                samples[j] = tmp;
            }
        }
    }

    return samples[validCount / 2];
}

// Phân cấp mức ngập theo yêu cầu:
// - Cấp 0: Độ lụt < 20 cm -> Không có cảnh báo
// - Cấp 1: Độ lụt từ 20 đến 50 cm -> Cảnh báo lụt nhẹ
// - Cấp 2: Độ lụt từ 50 cm trở lên -> Cảnh báo lụt nặng
int getFloodTier(float level) {
    if (level >= 50.0f) return 2; // Cảnh báo lụt nặng
    if (level >= 20.0f) return 1; // Cảnh báo lụt nhẹ
    return 0;                     // Không có cảnh báo (< 20 cm)
}

// ================= CẢM BIẾN & HTTP SUPABASE =================
void readSensors() {
    temp = bme.readTemperature();
    hum = bme.readHumidity();
    press = bme.readPressure() / 100.0F;

    lux = lightMeter.readLightLevel();
    if (lux < 0) lux = 0;

    rainDigital = digitalRead(RAIN_DO);
    rainAnalog = analogRead(RAIN_AO);

    // ================= ĐO MỰC NƯỚC / ĐỘ LỤT =================
    // Nếu có mức độ lụt mô phỏng được cài đặt từ Web (khi cảm biến siêu âm gặp sự cố)
    if (manualTargetWaterLevel >= 0.0f) {
        // Sinh số nhảy nhẹ ngẫu nhiên quanh mức lụt: từ -0.3 đến +0.3 cm
        float jitter = ((float)random(-3, 4)) / 10.0f;
        float simulatedWater = manualTargetWaterLevel + jitter;
        if (simulatedWater < 0.0f) simulatedWater = 0.0f;
        if (simulatedWater > SENSOR_MOUNT_HEIGHT_CM) simulatedWater = SENSOR_MOUNT_HEIGHT_CM;

        waterLevelCm = simulatedWater;
        rawDistanceCm = SENSOR_MOUNT_HEIGHT_CM - waterLevelCm;

        Serial.printf("[Manual Sync] Target: %.1f cm | Jitter: %+.1f cm -> Display: %.1f cm\n",
                      manualTargetWaterLevel, jitter, waterLevelCm);
    } else {
        // Fallback đọc cảm biến siêu âm vật lý JSN-SR04T
        rawDistanceCm = readUltrasonicMedian();

        if (rawDistanceCm < 0.0f) {
            // Không nhận được Echo: không coi là mực nước = 0.
            // Giữ nguyên giá trị trước đó để tránh một lần lỗi làm tụt mực nước.
            Serial.println("[JSN] Khong nhan duoc Echo -> giu gia tri nuoc cu");
        } else {
            float instantWater;

            // QUY TẮC THEO YÊU CẦU:
            // 1. Khoảng cách cảm biến đo được: Nếu lớn hơn 100 cm thì mặc định là Bằng 100 cm.
            float measuredDistance = rawDistanceCm;
            if (measuredDistance > SENSOR_MOUNT_HEIGHT_CM) { // SENSOR_MOUNT_HEIGHT_CM = 100.0
                measuredDistance = SENSOR_MOUNT_HEIGHT_CM;
            }
            if (measuredDistance < 0.0f) {
                measuredDistance = 0.0f;
            }

            // 2. Khoảng cách đặt cảm biến mặc định là 100 cm (SENSOR_MOUNT_HEIGHT_CM).
            // 3. Độ lụt = khoảng cách mặc định - khoảng cách cảm biến đo được.
            instantWater = SENSOR_MOUNT_HEIGHT_CM - measuredDistance;

            // Chống spike & Lọc mượt:
            const float MAX_WATER_JUMP_CM = 15.0f;
            static int spikeCounter = 0;

            if (!waterLevelInitialized) {
                // Lần đọc hợp lệ đầu tiên: lấy trực tiếp làm giá trị khởi tạo.
                smoothedWaterLevel = instantWater;
                waterLevelCm = smoothedWaterLevel;
                waterLevelInitialized = true;
            } else if (fabs(instantWater - waterLevelCm) > MAX_WATER_JUMP_CM) {
                spikeCounter++;
                if (spikeCounter >= 3) {
                    // Nếu giá trị lệch duy trì >= 3 lần đọc liên tiếp (khoảng 3 giây) thì cập nhật giá trị mới
                    smoothedWaterLevel = instantWater;
                    waterLevelCm = smoothedWaterLevel;
                    spikeCounter = 0;
                } else {
                    Serial.printf("[JSN] Loc spike (lan %d): %.1f cm -> bo qua, giu %.1f cm\n",
                                  spikeCounter, instantWater, waterLevelCm);
                }
            } else {
                spikeCounter = 0;
                // EMA 80/20: ưu tiên giá trị cũ, giảm rung mực nước.
                smoothedWaterLevel =
                    (smoothedWaterLevel * 0.8f) +
                    (instantWater * 0.2f);

                // Chặn sai số số thực ngoài khoảng 0..100 cm.
                if (smoothedWaterLevel < 0.0f) {
                    smoothedWaterLevel = 0.0f;
                }
                if (smoothedWaterLevel > SENSOR_MOUNT_HEIGHT_CM) {
                    smoothedWaterLevel = SENSOR_MOUNT_HEIGHT_CM;
                }

                waterLevelCm = smoothedWaterLevel;
            }

            Serial.printf("[JSN] Raw: %.1f cm | Clamped: %.1f cm | Do Lut: %.1f cm\n",
                          rawDistanceCm, measuredDistance, waterLevelCm);
        }
    }

    // Đo tốc độ gió
    long sumADC = 0;
    for (int i = 0; i < 20; i++) {
        sumADC += analogRead(WIND_PIN);
        delay(2);
    }
    float espVoltage = ((sumADC / 20.0f) / 4095.0f) * 3.3f;
    float rawWind = ((espVoltage / WIND_DIVIDER_RATIO) / 5.0f) * 30.0f;
    if ((espVoltage / WIND_DIVIDER_RATIO) < 0.1f) rawWind = 0.0f;
    windSpeed = (windSpeed * 0.7f) + (rawWind * 0.3f);

    Serial.printf("[Sensor] T:%.1f*C | H:%.0f%% | P:%.0fhPa | W:%.1fm/s | Water:%.1fcm (Tier:%d) | Rain:%d | Lux:%.0f\n",
                  temp, hum, press, windSpeed, waterLevelCm, getFloodTier(waterLevelCm), rainDigital, lux);
}

void sendDataToSupabase() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    http.begin(SUPABASE_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    http.addHeader("Prefer", "return=minimal");

    StaticJsonDocument<300> doc;
    doc["station_id"]     = STATION_ID;
    doc["temperature"]    = serialized(String(temp, 1));
    doc["humidity"]       = serialized(String(hum, 0));
    doc["pressure"]       = serialized(String(press, 0));
    doc["light_lux"]      = serialized(String(lux, 0));
    doc["rain_status"]    = rainDigital;
    doc["water_level_cm"] = serialized(String(waterLevelCm, 1));
    doc["wind_speed_ms"]  = serialized(String(windSpeed, 1));

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = http.POST(requestBody);
    if (httpCode >= 200 && httpCode < 300) {
        Serial.printf("[Supabase] Gui thanh cong! (Code: %d)\n", httpCode);
    } else {
        Serial.printf("[Supabase] Gui that bai! (Code: %d)\n", httpCode);
    }
    http.end();
}

// ================= ĐỒNG BỘ ĐỘ LỤT THỦ CÔNG TỪ SUPABASE =================
void fetchManualFloodTarget() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(SUPABASE_URL) + "?station_id=eq." + STATION_ID + "&rain_status=eq.-99&select=water_level_cm&order=created_at.desc&limit=1";
    http.begin(url);
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    http.setTimeout(1500);

    int httpCode = http.GET();
    if (httpCode == 200) {
        String payload = http.getString();
        StaticJsonDocument<256> doc;
        DeserializationError error = deserializeJson(doc, payload);
        if (!error && doc.size() > 0) {
            float target = doc[0]["water_level_cm"].as<float>();
            if (target >= 0.0f && target <= 100.0f) {
                if (fabs(target - manualTargetWaterLevel) > 0.01f) {
                    manualTargetWaterLevel = target;
                    Serial.printf("\n>>> [WEB SYNC] Dong bo do lut tu Web: %.1f cm <<<\n", manualTargetWaterLevel);
                }
            }
        }
    }
    http.end();
}

// ================= SETUP CHƯƠNG TRÌNH =================
void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n=== HE THONG QUAN TRAC MUA LU KHOI DONG ===");

    pinMode(RAIN_DO, INPUT);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    pinMode(WIND_PIN, INPUT);

    Wire.begin(21, 22);
    if (!bme.begin(0x76)) {
        bme.begin(0x77);
    }
    lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

    // Khởi tạo màn hình TFT
    tft.begin();
    tft.setRotation(1); // Màn hình ngang 320x240

    // Khởi tạo đồ họa LVGL
    lv_init();
    lv_disp_draw_buf_init(&draw_buf, buf, NULL, screenWidth * 10);

    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = screenWidth;
    disp_drv.ver_res = screenHeight;
    disp_drv.flush_cb = my_disp_flush;
    disp_drv.draw_buf = &draw_buf;
    lv_disp_drv_register(&disp_drv);

    // THỬ KẾT NỐI WI-FI
    bool connected = attemptConnectWiFi();

    if (!connected) {
        startConfigPortal();
        return;
    }

    // Lấy ngay mức độ lụt thủ công từ Web nếu có
    fetchManualFloodTarget();

    // Khởi tạo giao diện quan trắc chính LVGL
    ui_init();
    readSensors();
    confirmedFloodLevel = getFloodTier(waterLevelCm);
    candidateFloodLevel = confirmedFloodLevel;
    candidateStartTime = millis();
    ui_update_data(temp, hum, press, windSpeed, waterLevelCm, lux, rainDigital, rainAnalog, confirmedFloodLevel);
}

// ================= VÒNG LẶP CHÍNH =================
void loop() {
    // 1. NẾU ĐANG Ở CHẾ ĐỘ CẤU HÌNH WI-FI
    if (isConfigPortalActive) {
        dnsServer.processNextRequest();
        server.handleClient();
        delay(5);
        return;
    }

    // 2. NẾU ĐANG Ở CHẾ ĐỘ QUAN TRẮC BÌNH THƯỜNG
#if !LV_TICK_CUSTOM
    lv_tick_inc(5);
#endif
    lv_timer_handler();
    delay(5);

    unsigned long currentMillis = millis();

    // Kiểm tra lệnh độ lụt thủ công từ Web mỗi 2 giây
    if (currentMillis - prevTargetFetchTime >= INTERVAL_TARGET_FETCH) {
        prevTargetFetchTime = currentMillis;
        fetchManualFloodTarget();
    }

    // Đọc cảm biến định kỳ mỗi 1s để liên tục kiểm tra tính ổn định
    if (currentMillis - prevSensorReadTime >= INTERVAL_SENSOR_READ) {
        prevSensorReadTime = currentMillis;
        readSensors();

        int instantTier = getFloodTier(waterLevelCm);

        if (manualTargetWaterLevel >= 0.0f) {
            // Khi ở chế độ mô phỏng từ Web, phản ứng cập nhật cấp ngập ngay lập tức
            confirmedFloodLevel = instantTier;
        } else {
            // ================= BỘ LỌC XÁC THỰC ỔN ĐỊNH TRONG 15 GIÂY CHO CẢM BIẾN THẬT =================
            // Chỉ khi thông số thay đổi và duy trì liên tục trong đúng 15 giây thì mới xác nhận và gửi lên!
            if (instantTier != confirmedFloodLevel) {
                if (instantTier == candidateFloodLevel) {
                    // Vẫn đang duy trì cấp độ ứng viên
                    if (currentMillis - candidateStartTime >= STABILITY_WINDOW_MS) {
                        confirmedFloodLevel = candidateFloodLevel;
                        Serial.printf("\n>>> [XAC THUC 15S] XAC NHAN CAP NGAP MOI: Cap %d (Muc nuoc: %.1f cm) <<<\n", 
                                      confirmedFloodLevel, waterLevelCm);
                        sendDataToSupabase();
                        prevSupabasePostTime = currentMillis;
                    }
                } else {
                    candidateFloodLevel = instantTier;
                    candidateStartTime = currentMillis;
                    Serial.printf("[Bo loc 15s] Phat hien thay doi -> Cap %d. Dang theo doi 15 giay de xac nhan...\n", candidateFloodLevel);
                }
            } else {
                candidateFloodLevel = confirmedFloodLevel;
                candidateStartTime = currentMillis;
            }
        }

        // Cập nhật giao diện TFT với thông số mượt và cấp cảnh báo
        ui_update_data(temp, hum, press, windSpeed, waterLevelCm, lux, rainDigital, rainAnalog, confirmedFloodLevel);
    }

    // Gửi dữ liệu Supabase định kỳ (mỗi 4 giây để đồng bộ mượt mà với Web)
    if (currentMillis - prevSupabasePostTime >= INTERVAL_SUPABASE_POST) {
        prevSupabasePostTime = currentMillis;
        sendDataToSupabase();
    }
}