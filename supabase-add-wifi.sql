-- WiFi management channel.
--   wifi_scan    : the ESP32's latest scan of nearby networks (report + web read).
--   wifi_control : a singleton command row. The web writes cmd=connect + creds;
--                  the ESP32 reads it, reconnects, then clears it back to idle.

CREATE TABLE IF NOT EXISTS wifi_scan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ssid TEXT NOT NULL,
  rssi INT NOT NULL DEFAULT -100,
  encrypted BOOLEAN NOT NULL DEFAULT true,
  is_current BOOLEAN NOT NULL DEFAULT false,
  seen_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wifi_control (
  id INT PRIMARY KEY CHECK (id = 1),
  connected_ssid TEXT NOT NULL DEFAULT '',
  cmd TEXT NOT NULL DEFAULT 'idle',            -- idle | connect | forget
  ssid TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idle',         -- idle | pending | applied | failed
  result TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO wifi_control (id, connected_ssid, cmd, ssid, password, status, result)
VALUES (1, '', 'idle', '', '', 'idle', '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE wifi_scan ENABLE ROW LEVEL SECURITY;
ALTER TABLE wifi_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on wifi_scan" ON wifi_scan
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on wifi_control" ON wifi_control
  FOR ALL USING (true) WITH CHECK (true);