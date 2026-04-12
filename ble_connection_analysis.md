# Kompletna analiza komunikacji BLE — CaDA SMART (blocks_app)

> **WAŻNE:** Ten dokument zawiera pełną analizę reverse-engineeringu zdekompilowanej aplikacji CaDA SMART (`app.yundongjia.com.blocks_app` v2.5.10). Analiza jest wystarczająca do stworzenia własnej aplikacji sterującej urządzeniem.

---

## 1. Informacje o aplikacji

| Parametr | Wartość |
|---|---|
| **Producent** | Doubleeagle Industry China Limited (marka CaDA) |
| **Package** | `app.yundongjia.com.blocks_app` |
| **Wersja** | 2.5.10 (versionCode 62) |
| **Framework** | Flutter (Dart skompilowany do `libapp.so`) |
| **Min SDK** | Android 23 (6.0) |
| **Target SDK** | Android 35 |
| **Projekt developerski** | `E:/projects/ava/Cada/CadaV10/CadaV10/` |

---

## 2. Kluczowy wniosek — model komunikacji

> **UWAGA:** Aplikacja **NIE nawiązuje klasycznego połączenia BLE (GATT)**. W kodzie nie istnieją żadne wywołania `connectGatt()`, `writeCharacteristic()`, ani `BluetoothGattCallback`. Komunikacja opiera się **wyłącznie na pakietach reklamowych BLE (BLE Advertising)** — jest to model **bezpołączeniowy (connectionless)**.

### Jak to działa:
- **Telefon → Urządzenie**: Telefon **nadaje pakiety reklamowe** z danymi Manufacturer Specific Data. Urządzenie nasłuchuje tych pakietów i reaguje.
- **Urządzenie → Telefon**: Urządzenie **nadaje własne pakiety reklamowe**. Telefon je **skanuje** i odczytuje dane Manufacturer Specific Data.

```
┌──────────────────────────────────────────────────────┐
│                  TELEFON (Android)                    │
│                                                      │
│  Flutter/Dart UI                                     │
│       │                                              │
│       │ Method Channel: "com.coalar.ble/blemanager"  │
│       ▼                                              │
│  Natywny Android (Java)                              │
│       │                         │                    │
│       ▼                         ▼                    │
│  BLE Advertiser            BLE Scanner               │
│  (MFG ID: 0xC200)         (Nordic Semi)              │
└───────┬─────────────────────────┬────────────────────┘
        │                         ▲
        │ Pakiety reklamowe       │ Pakiety reklamowe
        ▼                         │
┌──────────────────────────────────────────────────────┐
│              URZĄDZENIE CaDA (autko)                 │
│                                                      │
│  Odbiór reklam ◄──── ────► Nadawanie reklam          │
│  (nasłuchuje)              (MFG 0x11AA / 0xFFF0)     │
└──────────────────────────────────────────────────────┘
```

---

## 3. Komunikacja Flutter ↔ Native Android

Aplikacja Flutter komunikuje się z natywną warstwą Java przez **Method Channels**:

- **`com.coalar.ble/blemanager`** — Główny kanał do sterowania BLE
- **`com.smadom.bugly.crashreport`** — Kanał do crash reportingu (Tencent Bugly)

Oba są rejestrowane w metodzie `A()` klasy `MainActivity` (odpowiednik `configureFlutterEngine`):

```java
// Kanał Bugly
k kVar = new k(aVar.k().i(), "com.smadom.bugly.crashreport");
this.f2905t = kVar;
kVar.e(new k.c() {
    public final void onMethodCall(j jVar, k.d dVar) {
        this.c0(jVar, dVar); // obsługa komend Bugly
    }
});

// Kanał BLE
k kVar2 = new k(aVar.k().i(), "com.coalar.ble/blemanager");
this.f2904s = kVar2;
kVar2.e(new k.c() {
    public final void onMethodCall(j jVar, k.d dVar) {
        this.d0(jVar, dVar); // obsługa komend BLE
    }
});
```

---

## 4. Pełna lista komend Method Channel

### 4.1 Komendy BLE (`com.coalar.ble/blemanager`)

Wszystkie komendy są obsługiwane przez metodę `d0()` w `MainActivity`. Poniżej dokładny opis każdej:

---

#### `checkBluetooth`

Inicjalizuje podsystem BLE. Tworzy managera Bluetooth, pobiera adapter i konfiguruje advertisery.

```java
// Wywołuje metodę Z():
private void Z() {
    // Tworzy singleton managera advertiserów
    i1.b bVarE = i1.b.e();
    this.f2909x = bVarE;
    // Inicjalizuje go kontekstem Activity
    bVarE.g(this);
    
    // Pobiera BluetoothManager z serwisu systemowego
    BluetoothManager bluetoothManager = (BluetoothManager) getSystemService("bluetooth");
    this.f2894i = bluetoothManager;
    
    if (bluetoothManager != null) {
        // Pobiera adapter BLE
        BluetoothAdapter adapter = bluetoothManager.getAdapter();
        this.f2893h = adapter;
        if (adapter != null) {
            // Inicjalizuje singleton advertisera (i1.f) tym adapterem
            Y(); // → f.b().d(this.f2893h)
        }
    }
}
```

**Zwraca:** `1` (sukces)

---

#### `getBleState`

Zapisuje referencję do `Result` callback-a. Będzie użyty później do powiadomienia Flutter o zmianie stanu Bluetooth (włączony/wyłączony).

```java
if (jVar.f4125a.equals("getBleState")) {
    this.f2896k = dVar; // zapisuje callback
}
```

**Zwraca:** `1`

---

#### `moveToBack`

Nie robi nic specjalnego (funkcja przenoszenia w tło).

**Zwraca:** `1`

---

#### `androidSDK`

Zwraca kategorię wersji API Androida. Flutter używa tego żeby wybrać strategię BLE (uprawnienia się różnią w zależności od wersji).

```java
int i7 = Build.VERSION.SDK_INT;
if (i7 >= 31) {
    return 3;       // Android 12+ (nowe uprawnienia BLE)
} else if (i7 >= 29) {
    return 2;       // Android 10-11
} else if (i7 >= 25) {
    return 1;       // Android 7-9
} else {
    return 0;       // Android 6 i starsze
}
```

---

#### `startScan`

Rozpoczyna skanowanie BLE. Najpierw zatrzymuje istniejące skanowanie, potem startuje nowe.

```java
public void e0() {
    k0(); // zatrzymaj istniejące skanowanie
    
    // Pobierz instancję skanera Nordic
    no.nordicsemi.android.support.v18.scanner.b bVarA = 
        no.nordicsemi.android.support.v18.scanner.b.a();
    
    // Ustawienia skanowania:
    // - duplikaty wyłączone (false)
    // - match num: 255 (max)  
    // - scan mode: 2 (LOW_LATENCY — najszybsze)
    q qVarA = new q.b()
        .d(false)     // reportDelay = false (natychmiastowe wyniki)
        .h(255)       // matchNum = 255
        .j(2)         // scanMode = LOW_LATENCY
        .a();         // build
    
    ArrayList arrayList = new ArrayList(); // puste filtry = skanuj wszystko
    h0();            // ustaw auto-restart co 2000ms
    this.f2898m = true;
    
    // Startuj skanowanie z callbackiem this.C (klasa e)
    bVarA.b(arrayList, qVarA, this.C);
}
```

Auto-restart skanowania co 2 sekundy:
```java
public void h0() {
    this.f2911z.removeMessages(0);
    this.f2911z.postDelayed(new Runnable() {
        public final void run() {
            this.e0(); // restart skanowania
        }
    }, 2000L);
}
```

**Zwraca:** `1`

---

#### `stopScan`

Zatrzymuje skanowanie BLE i wyłącza auto-restart.

```java
private void k0() {
    this.f2911z.removeMessages(0); // anuluj auto-restart
    if (this.f2898m) {
        // Zatrzymaj skaner
        no.nordicsemi.android.support.v18.scanner.b.a().d(this.C);
        this.f2898m = false;
    }
}
```

**Zwraca:** `1`

---

#### `startAdvertise` ⭐ (NAJWAŻNIEJSZA — wysyła komendy do urządzenia)

Buduje pakiet reklamowy BLE z tablicy bajtów i zaczyna nadawać.

**Parametry:**
| Parametr | Typ | Domyślnie | Opis |
|---|---|---|---|
| `length` | int | 16 | Ilość bajtów w komendzie |
| `byte0`..`byteN` | int | — | Poszczególne bajty komendy |
| `advertiseTime` | int | 0 | Czas nadawania w ms (0 = bez limitu) |
| `maxAdvertiser` | int | 5 | Max ilość advertiserów (API > 28) |

```java
// Odczyt parametrów:
int advertiseTime = jVar.c("advertiseTime") ? 
    ((Integer) jVar.a("advertiseTime")).intValue() : 0;
int length = jVar.c("length") ? 
    ((Integer) jVar.a("length")).intValue() : 16;
int maxAdvertiser = jVar.c("maxAdvertiser") ? 
    ((Integer) jVar.a("maxAdvertiser")).intValue() : 5;
if (maxAdvertiser <= 0) maxAdvertiser = 5;

if (Build.VERSION.SDK_INT > 28) {
    // API > 28: użyj managera wielu advertiserów (i1.b)
    byte[] bArr2 = new byte[length];
    for (int i6 = 0; i6 < length; i6++) {
        if (jVar.c("byte" + i6)) {
            bArr2[i6] = (byte) ((Integer) jVar.a("byte" + i6)).intValue();
        }
    }
    g0(bArr2, advertiseTime, maxAdvertiser);
    // g0() wywołuje: this.f2909x.i(bArr) → i1.b.i()
    
} else {
    // API ≤ 28: użyj singletona (i1.f)
    int[] iArr = new int[length];
    for (int i6 = 0; i6 < length; i6++) {
        if (jVar.c("byte" + i6)) {
            iArr[i6] = ((Integer) jVar.a("byte" + i6)).intValue();
        }
    }
    f.b().e(iArr, advertiseTime);
}
```

**Zwraca:** `1`

---

#### `stopAdvertise`

Zatrzymuje nadawanie pakietów reklamowych i anuluje timery.

```java
void j0() {
    f0();
}

private void f0() {
    // Anuluj timer
    Timer timer = this.f2908w;
    if (timer != null) {
        timer.cancel();
        this.f2908w = null;
    }
    // Zatrzymaj wszystkie advertisery
    i1.b bVar = this.f2909x;
    if (bVar != null) {
        bVar.j(); // → po 100ms zatrzymuje każdy i1.a w tablicy
    }
}
```

**Zwraca:** `1`

---

#### `startAdvertisePan`

Nadaje pakiety w trybie "Pan" — używa singletona `i1.f` (starszy mechanizm).

**Parametry:** takie same jak `startAdvertise`, ale `advertiseTime` domyślnie `300` ms.

```java
int advertiseTime = jVar.c("advertiseTime") ? 
    ((Integer) jVar.a("advertiseTime")).intValue() : 300;
int length = jVar.c("length") ? 
    ((Integer) jVar.a("length")).intValue() : 16;

int[] iArr2 = new int[length];
for (int i6 = 0; i6 < length; i6++) {
    if (jVar.c("byte" + i6)) {
        iArr2[i6] = ((Integer) jVar.a("byte" + i6)).intValue();
    }
}
f.b().e(iArr2, advertiseTime);
// f.b() → singleton i1.f
// .e() → buduje AdvertiseData i startuje advertising
```

---

#### `stopAdvertisePan`

Zatrzymuje nadawanie w trybie Pan.

```java
f.b().f();
// f() → stopAdvertising() na BluetoothLeAdvertiser
```

---

#### `encry`

Szyfruje tablicę bajtów. Przyjmuje string CSV, zwraca wynik.

```java
String[] strArrSplit = jVar.b().toString().split(",");
byte[] bArr = new byte[strArrSplit.length];
for (int i6 = 0; i6 < strArrSplit.length; i6++) {
    bArr[i6] = (byte) Integer.parseInt(strArrSplit[i6]);
}
// Wywołuje i1.f.a(bArr) — konwersja bajtów na hex string
Object result = f.a(bArr);
dVar.success(result);
```

Metoda `f.a()`:
```java
public static String a(byte[] bArr) {
    if (bArr == null) return "";
    StringBuffer sb = new StringBuffer();
    for (byte b5 : bArr) {
        int i5 = b5 & 255;
        if (i5 < 16) sb.append("0");
        sb.append(Integer.toHexString(i5));
    }
    return sb.toString().trim();
}
```

---

### 4.2 Eventy Native → Flutter (wyniki skanowania)

Callback skanera to klasa wewnętrzna `e` w `MainActivity`, dziedzicząca z `v3.m`:

```java
class e extends m {
    // Wywoływany przy każdym znalezionym urządzeniu BLE
    public void c(int rssi, p scanResult) {
        // Restart auto-skanowania
        MainActivity.this.h0();
        
        try {
            // === URZĄDZENIA TYPU "HS" ===
            // Warunek: nazwa zawiera "HSZ_HS" 
            //          i ma Manufacturer Data pod kluczem 4522 (0x11AA)
            if (scanResult.a().getName() != null 
                && scanResult.a().getName().contains("HSZ_HS")
                && scanResult.b() != null        // ScanRecord istnieje
                && scanResult.b().d() != null     // ManufacturerSpecificData istnieje
                && scanResult.b().e(4522) != null // dane pod kluczem 0x11AA
            ) {
                // Wysyłamy event "scanResultHS" do Fluttera
                // z danymi jako hex string (np. "0a1bff03...")
                MainActivity.this.f2904s.c(
                    "scanResultHS", 
                    MainActivity.a0(scanResult.b().e(4522), false)
                );
            }
            
            // === URZĄDZENIA TYPU "PC" ===
            // Warunek: ma Manufacturer Data pod kluczem 65520 (0xFFF0)
            if (scanResult.b() != null 
                && scanResult.b().d() != null 
                && scanResult.b().e(65520) != null
            ) {
                // Wysyłamy event "scanResultPC" do Fluttera
                MainActivity.this.f2904s.c(
                    "scanResultPC", 
                    MainActivity.a0(scanResult.b().e(65520), false)
                );
            }
            
        } catch (Exception e5) {
            e5.printStackTrace();
        }
    }
    
    // Wywoływany przy błędzie skanowania
    public void b(int errorCode) {
        Log.d("yqy", "error code:" + errorCode);
    }
}
```

Konwersja bajtów na hex string:
```java
public static String a0(byte[] bArr, boolean withSpaces) {
    if (bArr == null || bArr.length < 1) return null;
    StringBuilder sb = new StringBuilder();
    for (byte b5 : bArr) {
        String hex = Integer.toHexString(b5 & 255);
        if (hex.length() == 1) hex = '0' + hex;
        sb.append(hex);
        if (withSpaces) sb.append(" ");
    }
    return sb.toString().trim();
    // Przykład: [0x0A, 0xFF, 0x01] → "0aff01"
}
```

---

### 4.3 Komendy Bugly (`com.smadom.bugly.crashreport`)

Obsługiwane w metodzie `c0()`:

```java
private void c0(j jVar, k.d dVar) {
    if (jVar.f4125a.equals("initBugly")) {
        // Inicjalizuje Tencent Bugly crash reporting
        // App ID: "5843477167", wersja: "2.4.0"
        b0();
    } else if (jVar.f4125a.equals("testBugly")) {
        // Rzuca RuntimeException po 3 sekundach (test crasha)
        l0();
    } else if (jVar.f4125a.equals("postBugly") 
               && jVar.c("message") && jVar.c("detail")) {
        // Wysyła ręczny raport błędu
        o1.a.b(4, "CaDA Exception", 
               (String) jVar.a("message"), 
               (String) jVar.a("detail"), null);
    }
    dVar.success(1);
}
```

---

## 5. Szczegóły techniczne — wysyłanie komend (Advertising)

### 5.1 Parametry BLE Advertising

| Parametr | Wartość | Opis |
|---|---|---|
| **Manufacturer ID** | `49664` (0xC200) | Identyfikator producenta w pakietach BLE |
| **Advertise Mode** | `ADVERTISE_MODE_LOW_LATENCY` (2) | Najszybsze nadawanie |
| **TX Power Level** | `ADVERTISE_TX_POWER_HIGH` (3) | Maksymalna moc nadawania |
| **Connectable** | `true` | Urządzenia mogą próbować się połączyć |
| **Timeout** | `0` | Bez limitu czasowego |
| **Include Device Name** | `false` | Nie dodaje nazwy urządzenia do pakietu |
| **Rate Limiting** | min. 100 ms | Minimalna przerwa między pakietami |

### 5.2 Struktura pakietu reklamowego

```
┌─────────────────────────────┐
│ BLE Advertisement Packet    │
├─────────────────────────────┤
│ AD Type: Manufacturer Data  │
│ Company ID: 0xC200 (49664)  │
│ Data: [byte0, byte1, ...,   │
│        byte(length-1)]      │
│ Domyślna długość: 16 bajtów │
└─────────────────────────────┘
```

### 5.3 Klasa `i1.a` — Pojedynczy BLE Advertiser

Opakowuje `BluetoothLeAdvertiser`. Odpowiada za budowanie `AdvertiseData` i start/stop nadawania.

```java
public class a {
    private BluetoothManager f4410a;
    private BluetoothAdapter f4411b;
    private BluetoothLeAdvertiser f4412c;
    private AdvertiseSettings f4413d;
    private AdvertiseCallback f4414e;
    private Context f4415f;

    // Konstruktor — inicjalizuje BLE i ustawienia advertisingu
    public a(Context context) {
        this.f4415f = context;
        if (hasBluetoothLE()) {
            this.f4410a = (BluetoothManager) context.getSystemService("bluetooth");
        }
        this.f4411b = BluetoothAdapter.getDefaultAdapter();
        this.f4412c = getAdvertiser();
        
        // Ustawienia advertisingu:
        this.f4413d = new AdvertiseSettings.Builder()
            .setAdvertiseMode(2)      // LOW_LATENCY
            .setConnectable(true)
            .setTimeout(0)            // bez limitu
            .setTxPowerLevel(3)       // HIGH
            .build();
    }

    // Buduje AdvertiseData z Manufacturer ID 49664 (0xC200)
    private AdvertiseData b(byte[] bArr) {
        AdvertiseData.Builder builder = new AdvertiseData.Builder();
        builder.setIncludeDeviceName(false);
        byte[] bArr2 = new byte[bArr.length];
        System.arraycopy(bArr, 0, bArr2, 0, bArr.length);
        builder.addManufacturerData(49664, bArr2); // 0xC200
        return builder.build();
    }

    // Startuje nadawanie
    public void f(byte[] bArr) {
        g(bArr, getCallback());
    }

    public void g(byte[] bArr, AdvertiseCallback callback) {
        try {
            h(); // najpierw zatrzymaj poprzednie
            this.f4412c.startAdvertising(this.f4413d, b(bArr), callback);
        } catch (Exception e5) {
            e5.printStackTrace();
        }
    }

    // Zatrzymuje nadawanie
    public void h() {
        i(getCallback());
    }

    public void i(AdvertiseCallback callback) {
        try {
            this.f4412c.stopAdvertising(callback);
        } catch (Exception e5) {
            e5.printStackTrace();
        }
    }
}
```

### 5.4 Klasa `i1.b` — Manager wielu advertiserów (Singleton)

Zarządza tablicą obiektów `i1.a`. Rozdziela pracę round-robin. Rate limiting 100ms. Nasłuchuje zmian stanu Bluetooth.

```java
public class b {
    public static int f4418i = 30;  // interwał
    private static b f4419j;        // singleton
    
    private i1.a[] f4420a = new i1.a[0]; // tablica advertiserów
    private Handler f4421b;
    private long f4422c;             // timestamp ostatniego nadawania
    private int f4423d = 0;          // indeks round-robin
    private int f4424e;              // stan Bluetooth
    private Context f4425f;
    private final BroadcastReceiver f4426g; // listener stanu BT

    // Singleton
    public static synchronized b e() {
        if (f4419j == null) {
            f4419j = new b();
        }
        return f4419j;
    }

    // Inicjalizacja — tworzy tablicę advertiserów
    public void g(Context context) {
        this.f4425f = context;
        this.f4421b = new Handler(Looper.getMainLooper());
        this.f4420a = new i1.a[1]; // 1 advertiser
        for (int i5 = 0; i5 < this.f4420a.length; i5++) {
            this.f4420a[i5] = new i1.a(context);
        }
        
        if (!BluetoothAdapter.getDefaultAdapter().isEnabled()) {
            h(); // poproś o włączenie BT
        }
        
        this.f4424e = BluetoothAdapter.getDefaultAdapter().getState();
        
        // Rejestruj BroadcastReceiver na zmiany stanu BT
        IntentFilter intentFilter = new IntentFilter();
        intentFilter.addAction("android.bluetooth.adapter.action.STATE_CHANGED");
        intentFilter.addAction("android.bluetooth.adapter.action.DISCOVERY_STARTED");
        intentFilter.addAction("android.bluetooth.adapter.action.DISCOVERY_FINISHED");
        this.f4425f.registerReceiver(this.f4426g, intentFilter);
        
        f4418i = f(); // oblicz interwał: 150 / ilość_advertiserów
    }

    // ★ GŁÓWNA METODA — wysyła bajty jako BLE Advertisement
    public void i(byte[] bArr) {
        // Rate limiting: min 100ms między pakietami
        if (System.currentTimeMillis() - this.f4422c > 100) {
            Handler handler = this.f4421b;
            if (handler != null) {
                handler.removeMessages(0);
            }
            this.f4422c = System.currentTimeMillis();
            
            // Round-robin: wybierz następny advertiser z tablicy
            i1.a[] aVarArr = this.f4420a;
            int i5 = this.f4423d;
            this.f4423d = i5 + 1;
            aVarArr[i5 % aVarArr.length].f(bArr); // nadaj przez i1.a.f()
        }
    }

    // Zatrzymaj wszystkie advertisery (z opóźnieniem 100ms)
    public void j() {
        Handler handler = this.f4421b;
        if (handler != null) {
            handler.removeMessages(0);
        }
        this.f4421b.postDelayed(new Runnable() {
            public void run() {
                for (i1.a aVar : b.this.f4420a) {
                    if (aVar != null) {
                        aVar.h(); // stop advertising
                    }
                }
            }
        }, 100L);
    }

    // Poproś o włączenie Bluetooth
    public void h() {
        Intent intent = new Intent("android.bluetooth.adapter.action.REQUEST_DISCOVERABLE");
        intent.addFlags(268435456); // FLAG_ACTIVITY_NEW_TASK
        this.f4425f.startActivity(intent);
    }
}
```

### 5.5 Klasa `i1.f` — Alternatywny singleton advertisera

Używany dla starszych API i trybu "Pan". Ten sam Manufacturer ID 0xC200.

```java
public class f {
    static int f4432j = 2402;       // domyślny manufacturer ID (zmieniony na 49664 przy użyciu)
    private static f f4433k;        // singleton
    
    private BluetoothLeAdvertiser f4434a;
    private AdvertiseSettings f4435b;
    private AdvertiseCallback f4436c;
    private BluetoothAdapter f4437d;
    private int f4438e = 0;
    Handler f4439f = new Handler();
    private boolean f4441h = true;
    private Runnable f4442i;         // runnable do zatrzymania po timeout
    private int f4440g;              // status (100=ok, 101=adapter null, 102=advertiser null)

    // Singleton
    public static f b() {
        if (f4433k == null) {
            synchronized (f.class) {
                if (f4433k == null) {
                    f4433k = new f();
                }
            }
        }
        return f4433k;
    }

    // Inicjalizacja adaptera
    public void d(BluetoothAdapter bluetoothAdapter) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled() || this.f4434a != null) {
            this.f4440g = 101;
            return;
        }
        BluetoothLeAdvertiser advertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
        this.f4434a = advertiser;
        if (advertiser == null) {
            this.f4440g = 102;
        }
        this.f4437d = bluetoothAdapter;
    }

    // ★ Nadaje pakiet reklamowy (tryb Pan / starsze API)
    public int e(int[] iArr, int timeoutMs) {
        if (this.f4434a == null) return this.f4440g;
        
        try {
            g(); // zatrzymaj poprzednie
            
            // Konwersja int[] → byte[]
            byte[] bArr = new byte[iArr.length];
            for (int i6 = 0; i6 < iArr.length; i6++) {
                bArr[i6] = (byte) iArr[i6];
            }
            
            // Manufacturer ID = 49664 (0xC200)
            f4432j = 49664;
            AdvertiseData data = new AdvertiseData.Builder()
                .addManufacturerData(f4432j, bArr)
                .build();
            
            AdvertiseCallback callback = new b(); // klasa wewnętrzna
            this.f4436c = callback;
            this.f4434a.startAdvertising(this.f4435b, data, callback);
            
            // Jeśli timeout > 0, zaplanuj zatrzymanie
            if (timeoutMs > 0) {
                this.f4439f.postDelayed(this.f4442i, timeoutMs);
            }
            return 100; // sukces
            
        } catch (Exception e5) {
            e5.printStackTrace();
            return 0;
        }
    }

    // Zatrzymaj nadawanie
    public void f() {
        try {
            if (this.f4436c != null && this.f4434a != null) {
                this.f4434a.stopAdvertising(this.f4436c);
                this.f4436c = null;
            }
        } catch (Exception e5) {
            e5.printStackTrace();
        }
    }

    // Zatrzymaj + anuluj timer
    public void g() {
        f();
        this.f4439f.removeCallbacks(this.f4442i);
    }
    
    // Konwersja bajtów na hex string
    public static String a(byte[] bArr) {
        if (bArr == null) return "";
        StringBuffer sb = new StringBuffer();
        for (byte b5 : bArr) {
            int i5 = b5 & 255;
            if (i5 < 16) sb.append("0");
            sb.append(Integer.toHexString(i5));
        }
        return sb.toString().trim();
    }
}
```

---

## 6. Szczegóły techniczne — odbieranie danych (Scanning)

### 6.1 Parametry skanowania

| Parametr | Wartość | Opis |
|---|---|---|
| **Biblioteka** | Nordic Semiconductor Scanner | `no.nordicsemi.android.support.v18.scanner` |
| **Scan Mode** | Low Latency (2) | Najszybsze skanowanie |
| **Match Num** | 255 | Maksymalna liczba dopasowań |
| **Report Delay** | `false` | Wyniki natychmiast, bez buforowania |
| **Auto-restart** | Co 2000 ms | Skanowanie restartuje się automatycznie |
| **Filtry** | Brak (pusta lista) | Skanuje wszystkie urządzenia |

### 6.2 Rozpoznawanie urządzeń - podsumowanie

| Typ | Warunek nazwy | Klucz Manufacturer Data | Event do Fluttera |
|---|---|---|---|
| **HS** | Nazwa zawiera `"HSZ_HS"` | `4522` (0x11AA) | `scanResultHS` |
| **PC** | Dowolna | `65520` (0xFFF0) | `scanResultPC` |

---

## 7. Komendy sterujące urządzeniem (z Dart/Flutter)

> **UWAGA:** Konkretne bajty komend (wartości `byte0`..`byteN`) są konstruowane po stronie **Dart/Flutter** i skompilowane do binarnego `libapp.so`. Poniżej lista **nazw komend** wyekstrahowanych z `libapp.so` metodą analizy stringów.

### 7.1 Komendy ruchu (prefix `control_`)

| Nazwa komendy | Prawdopodobna funkcja |
|---|---|
| `control_forward` | Jazda do przodu |
| `control_backward` | Jazda do tyłu |
| `control_turn_left` | Skręt w lewo |
| `control_turn_right` | Skręt w prawo |
| `control_back_left` | Jazda do tyłu + skręt w lewo |
| `control_back_right` | Jazda do tyłu + skręt w prawo |
| `control_wait` | Zatrzymanie / pauza |
| `control_forever` | Pętla nieskończona (programowanie blokowe) |
| `control_repeat` | Powtarzanie (programowanie blokowe) |
| `control_point` | Punkt trasy (tryb ścieżki) |

### 7.2 Komendy meta (prefix `meta_`)

| Nazwa komendy | Prawdopodobna funkcja |
|---|---|
| `meta_light_front` | Włącz/wyłącz światła przednie |
| `meta_light_back` | Włącz/wyłącz światła tylne |
| `meta_sound` | Odtwórz dźwięk |
| `meta_sound_forward` | Dźwięk jazdy do przodu |
| `meta_sound_backward` | Dźwięk jazdy do tyłu |
| `meta_sound_engine` | Dźwięk silnika |

---

## 8. Obsługiwane modele pojazdów

Aplikacja obsługuje 93 modele CaDA, grupowane w 4 kategorie:

| Kategoria | Ilość | Przykłady |
|---|---|---|
| **Mini Car** | 10 | txtMiniCar0..txtMiniCar9 |
| **Super Car** | 8 | txtSuperCar0..txtSuperCar7 |
| **Off-Road Car** | 4 | txtOffRoadCar0..txtOffRoadCar3 |
| **Konkretne modele** | 71+ | C51072W RACE CAR, C51301W HELIOS, C51074W EVO RACE CAR, itp. |

Wybrane numery katalogowe:
```
C51072W — RACE CAR
C51073W — BLUE RACE CAR
C51074W — EVO RACE CAR
C51075W — BLAZE CAR
C51045W — PIONEER
C51055W — LIGHTING
C51101W — ASSASSIN
C51301W — HELIOS
C51306W — Blade
C51307W — GT Sport Car
C51201W — JIMNY
C51202W — HUMVEE
C59002W — Triceratops
C51078W — 2008 CITROEN C4 WRC
C56011W — DongFeng
C56012W — Yinji
C59001W — T-Rex (?)
C51082W — Z-WIND
C51071W — LOTUS
C51054W — WIND
```

---

## 9. Wymagane uprawnienia Android

```xml
<!-- BLE podstawowe (API ≤ 30) -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30"/>
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30"/>

<!-- BLE nowe (API ≥ 31) -->
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE"/>
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>

<!-- Lokalizacja (wymagana do skanowania BLE) -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>

<!-- Internet (Bugly crash reporting) -->
<uses-permission android:name="android.permission.INTERNET"/>

<!-- Wymóg BLE hardware -->
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true"/>
```

---

## 10. Jak stworzyć własną aplikację — checklist

### 10.1 Inicjalizacja BLE
1. Sprawdź uprawnienia BLE + lokalizacji (różne w zależności od API — patrz `androidSDK`)
2. Pobierz `BluetoothManager` → `BluetoothAdapter` → `BluetoothLeAdvertiser`
3. Sprawdź czy BT jest włączony, jeśli nie — pokaż dialog włączenia
4. Skonfiguruj `AdvertiseSettings` (mode=2, txPower=3, connectable=true, timeout=0)

### 10.2 Skanowanie urządzeń
1. Użyj `BluetoothLeScanner` (lub Nordic Scanner)
2. Skanuj bez filtrów
3. W callbacku sprawdzaj:
   - Nazwa urządzenia zawiera `"HSZ_HS"` → typ HS
   - Manufacturer Specific Data pod kluczem `4522` (0x11AA) → dane HS
   - Manufacturer Specific Data pod kluczem `65520` (0xFFF0) → dane PC
4. Restartuj skanowanie co 2 sekundy

### 10.3 Wysyłanie komend
1. Zbuduj tablicę 16 bajtów z komendą
2. Zbuduj `AdvertiseData` z `addManufacturerData(49664, byteArray)`
3. Zbuduj `AdvertiseSettings` (mode=2, txPower=3, connectable=true, timeout=0)
4. Wywołaj `BluetoothLeAdvertiser.startAdvertising(settings, data, callback)`
5. Zachowaj min. 100ms przerwy między pakietami
6. Aby zatrzymać: `BluetoothLeAdvertiser.stopAdvertising(callback)`

### 10.4 Poznanie bajtów komend

> **WAŻNE:** Konkretnych wartości bajtów (`byte0`..`byte15`) nie udało się odczytać z dekompilacji, gdyż są generowane w skompilowanym kodzie Dart (`libapp.so`). Aby je poznać:
>
> 1. **Sniffuj pakiety BLE** — użyj aplikacji **nRF Connect** lub **Wireshark** z adapterem BLE do przechwycenia pakietów nadawanych przez oryginalną aplikację CaDA. W nRF Connect włącz "Advertiser scanner" i obserwuj pakiety z Manufacturer ID `0xC200`.
> 2. **Użyj reFlutter** — narzędzie do dekompilacji snapshot'ów Dart z `libapp.so`: https://github.com/niconi21/reFlutter
> 3. **Reverse-engineer protokołu** — naciskaj różne przyciski w oryginalnej apce i nagrywaj wartości bajtów w snifferze. Porównaj wzorce.

### 10.5 Znane stałe — podsumowanie
```
Manufacturer ID (wysyłanie):  0xC200 (49664)
Manufacturer ID (odbiór HS):  0x11AA (4522)  
Manufacturer ID (odbiór PC):  0xFFF0 (65520)
Nazwa urządzenia BLE:         zawiera "HSZ_HS"
Domyślna długość pakietu:     16 bajtów
Min interwał nadawania:       100 ms
Restart skanowania:           co 2000 ms
AdvertiseMode:                LOW_LATENCY (2)
TxPowerLevel:                 HIGH (3)
Connectable:                  true
Timeout:                      0 (bez limitu)
IncludeDeviceName:            false
```

---

## 11. Ograniczenia i uwagi

- **Brak gwarancji dostarczenia**: BLE Advertising jest broadcastem — nie ma potwierdzeń odbioru. Jeśli pakiet się zgubi, komenda nie dotrze.
- **Ograniczony rozmiar**: Max ~27 bajtów danych Manufacturer Data w jednym pakiecie BLE 4.x. Aplikacja domyślnie używa 16 bajtów.
- **Zasięg**: ~10 metrów (z tłumaczeń w aplikacji: "RC afstand 10 meter", "distance RC 10 mètres").
- **Szyfrowanie**: Istnieje klasa `ENCRYPTED_SIZE` w Darcie i metoda `encry` — pakiety mogą być szyfrowane przed wysłaniem.
- **Logika Dart niedostępna**: Główna logika sterowania (mapowanie `control_forward` → konkretne bajty) jest w skompilowanym `libapp.so`.

---

## 12. Źródła stringów z libapp.so

Logika Dart jest skompilowana do binarnego `libapp.so` (4.2 MB, ARM64). Bezpośredni odczyt kodu Dart jest niemożliwy bez specjalistycznych narzędzi (reFlutter, Doldrums). Jednak analiza stringów osadzonych w binarce pozwoliła wyekstrahować:

- 16 unikalnych komend sterujących (`control_*`, `meta_*`)
- 93 identyfikatory modeli pojazdów
- Nazwy parametrów Method Channel (`advertiseTime`, `maxAdvertiser`, `length`, `byte0`..`byteN`)
- Komunikaty debug (`=====sendCheckBluetooth=======`, `========pan end:=========`)
- Stałe (`ENCRYPTED_SIZE`)
- Nazwy eventów (`scanResultHS`, `scanResultPC`, `RcLowBattery`, `app_ok`)

---

## 13. Dostępne pliki diagnostyczne

### 13.1 Plik logcat

**Plik:** `samsung-SM-M336B-Android-14_2026-04-04_103327 (1).logcat`
**Format:** JSON (Android Studio logcat export)
**Urządzenie:** Samsung SM-M336B, Android 14, API 34
**Filtr:** `app.yundongjia.com.blocks_app`

Plik zawiera logi systemowe z sesji używania aplikacji CaDA SMART. Jest w formacie JSON z polami:
- `header.tag` — tag loga
- `header.applicationId` — identyfikator aplikacji
- `message` — treść komunikatu

**Uwaga:** Ten plik zawiera głównie logi systemowe (kamera, system). Logi BLE z aplikacji CaDA mogą być widoczne pod tagami takimi jak `yqy` (tag użyty w kodzie Java do logowania błędów skanera).

### 13.2 Plik HCI Snoop Log ⭐

**Plik:** `btsnooz_hci.log.last`
**Rozmiar:** 238 768 bajtów (~233 KB)
**Format:** `btsnooz` (skompresowany format Samsung/Android HCI snoop log)

> **TO JEST NAJWAŻNIEJSZY PLIK** — zawiera surowe pakiety BLE przechwycone przez kontroler Bluetooth telefonu. Tu są konkretne bajty komend wysyłanych do urządzenia (Manufacturer Data z ID 0xC200).

#### Jak sparsować plik `btsnooz_hci.log.last`

**Format pliku btsnooz:**
```
Offset  | Rozmiar | Opis
--------|---------|------------------
0       | 7       | Magic: "btsnooz" (ASCII)
7       | 1       | Null terminator (0x00)
8       | 1       | Wersja formatu
9       | 8       | Ostatni timestamp (big-endian, 64-bit)
17      | ...     | Dane skompresowane zlib (deflate)
```

Po dekompresji zlib, dane zawierają pakiety HCI w odwrotnej kolejności:
```
Każdy rekord:
Offset  | Rozmiar | Opis
--------|---------|------------------
0       | 2       | Długość pakietu (big-endian, 16-bit)
2       | 1       | Flagi (bit 0: 0=wysłany, 1=odebrany)
3       | N       | Dane pakietu HCI (N = długość)
```

#### Metoda 1: Wireshark (ZALECANA)

1. **Skonwertuj btsnooz → btsnoop** za pomocą skryptu:
   ```python
   import struct, zlib
   
   with open('btsnooz_hci.log.last', 'rb') as f:
       data = f.read()
   
   version = data[8]
   last_ts = struct.unpack('>q', data[9:17])[0]
   decompressed = zlib.decompress(data[17:])
   
   # Parse packets (reverse order in btsnooz)
   packets = []
   offset = 0
   while offset + 3 <= len(decompressed):
       length = struct.unpack('>H', decompressed[offset:offset+2])[0]
       flags = decompressed[offset+2]
       offset += 3
       if offset + length > len(decompressed): break
       pkt = decompressed[offset:offset+length]
       offset += length
       packets.append((length, flags, pkt))
   
   packets.reverse()  # btsnooz stores in reverse
   
   # Write btsnoop file for Wireshark
   with open('output.btsnoop', 'wb') as f:
       # btsnoop header
       f.write(b'btsnoop\x00')
       f.write(struct.pack('>II', 1, 2001))  # version=1, HCI UART type
       
       ts_base = 0x00dcddb30f2f8000  # btsnoop epoch offset
       for i, (length, flags, pkt) in enumerate(packets):
           orig_len = len(pkt)
           inc_len = len(pkt)
           pkt_flags = 0 if (flags & 1) == 0 else 1
           drops = 0
           timestamp = ts_base + i * 1000  # synthetic timestamps
           
           f.write(struct.pack('>IIIIq', orig_len, inc_len, pkt_flags, drops, timestamp))
           f.write(pkt)
   
   print(f"Written {len(packets)} packets to output.btsnoop")
   ```

2. **Otwórz `output.btsnoop` w Wireshark**

3. **Filtruj** w Wireshark:
   - Wpisz w filtrze: `btcommon.eir_ad.entry.company_id == 0xc200`
   - Lub szukaj hex: `00c2` (little-endian ID producenta)

4. **Szukaj pakietów HCI LE Set Advertising Data** (opcode `0x2008`)
   - Filtr Wireshark: `bthci_cmd.opcode == 0x2008`
   - W tych pakietach będą dane Manufacturer Specific z ID `0xC200` a zaraz po nim 16 bajtów komendy

#### Metoda 2: nRF Connect (na żywo)

1. Zainstaluj **nRF Connect** na drugim telefonie
2. Na pierwszym telefonie otwórz aplikację CaDA SMART i połącz z autem
3. Na telefonie z nRF Connect włącz skaner
4. Szukaj pakietów reklamowych z **Manufacturer Specific Data**:
   - Company ID: `0xC200` (49664)
   - Dane: 16 bajtów = komenda sterująca
5. Na aplikacji CaDA naciskaj kolejno: przód, tył, lewo, prawo, światła
6. Obserwuj zmiany w bajtach Manufacturer Data

#### Metoda 3: Android HCI Snoop Log (nagrywanie nowej sesji)

1. Na telefonie wejdź w **Ustawienia → Opcje deweloperskie**
2. Włącz **Bluetooth HCI Snoop Log**
3. Restartuj Bluetooth (wyłącz/włącz)
4. Otwórz aplikację CaDA, połącz z autem, wykonaj komendy
5. Wyłącz HCI Snoop Log
6. Skopiuj plik na komputer:
   ```bash
   adb pull /data/misc/bluetooth/logs/btsnoop_hci.log
   ```
7. Otwórz bezpośrednio w Wireshark (format btsnoop)

#### Czego szukać w Wireshark

W pakietach `LE Set Advertising Data` szukaj struktury:
```
Bajt  | Wartość   | Opis
------|-----------|------------------
0     | LEN+3     | Długość sekcji AD
1     | 0xFF      | AD Type = Manufacturer Specific Data
2-3   | 0x00 0xC2 | Company ID (little-endian: 0xC200 = 49664)
4-19  | XX XX ... | 16 bajtów komendy (to czego szukamy!)
```

Przykładowy wynik (hipotetyczny):
```
control_forward:    FF 00C2 01 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00
control_backward:   FF 00C2 02 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00
control_turn_left:  FF 00C2 03 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00
control_turn_right: FF 00C2 04 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00
meta_light_front:   FF 00C2 10 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00
(bajty powyżej to tylko przykład — prawdziwe wartości są w pliku HCI!)
```

> **WAŻNE:** Bajty mogą być szyfrowane (klasa `ENCRYPTED_SIZE` w Darcie) — w takim przypadku będą wyglądać na losowe. Porównaj wiele pakietów tej samej komendy i szukaj stałych wzorców.
