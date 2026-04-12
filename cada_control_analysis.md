# Analiza procesu łączenia się i przesyłania komend do samochodu CaDA

### 1. Model komunikacji (bezpołączeniowy BLE)
W przeciwieństwie do większości inteligentnych urządzeń, aplikacja **nie nawiązuje klasycznego połączenia Bluetooth Low Energy (szeregowego przez protokół GATT)**. Oznacza to, że unika się typowego parowania i modyfikowania powiązanych z nim charakterystyk sprzętowych. Zamiast tego urządzenie i aplikacja realizują tryb **bezpołączeniowy (Connectionless BLE Advertising)**.

Sprowadza się on do tego, że:
1. Telefon po prostu nadaje w powietrze pakiety reklamowe (BLE Advertisements). 
2. Dane (komendy) umieszczone są w niestandardowym bloku **Manufacturer Specific Data** pakietu reklamowego. 
3. Zabawka będąc w trybie skanowania nasłuchuje pakietów. Usłyszawszy odpowiednio spreparowaną komendę z autoryzowanym identyfikatorem producenta, bezzwłocznie wykonuje zaszytą w niej operację.

### 2. Parametry komunikacji BLE
Wykorzystywane stałe konfiguracji połączenia w podsystemie reklamowym:
- **ID Producenta (Company/Manufacturer ID):** `0xC200` (Dziesiętnie: `49664`)
- **Długość pakietu z komendą:** Ograniczona do 16 bajtów
- **Tryb ogłaszania (Advertise Mode):** `LOW_LATENCY` (`2`) — priorytet na natychmiastowe obniżenie opóźnień (istotne podczas sterowania zręcznościowego).
- **Moc nadajnika (TX Power Level):** `HIGH` (`3`) — zoptymalizowane pod kątem maksymalnego zasięgu.
- **Odstęp między komendami:** Odgórnie ograniczony (rate-limiting) do **minimalnie 100 milisekund**, żeby nie zasypać odbiornika zbędnymi przerwaniami i nie powodować lagów.

Aby uzyskać odpowiedź od zabawki, telefon pełni rolę skanera podsłuchującego sygnały z urządzenia – najczęściej przyporządkowuje je pod maską nazwy kodowej `HSZ_HS` z dodanym do Manufacturer Data kluczem identyfikacyjnym `0x11AA` (`4522`) lub `0xFFF0`.

---

### 3. Komendy sterujące
Komendy są formatowane jako tablica szesnastu bajtów (`[byte0, byte1, byte2, ..., byte15]`). Zwyczajowo w aplikacji prototypowej zdekodowane komendy opierają się na bardzo logicznym schemacie: `[typ_komendy, wartosc_1, wartosc_2, flaga_dodatków]`. Pozostałe braki aż do limitu uzupełnia się systemowymi zerami (`0x00`).

Oto główne typy poleceń realizowane przez aplikację:

#### Zatrzymanie się (STOP)
Aplikacja, aby zapobiec zablokowaniu przepływu i wymusić zatrzymanie po puszczeniu kontrolera, wysyła pusty pakiet bajtowy.
```plaintext
Bajt: [0x00, 0x00, 0x00, 0x00]
```

#### Poruszanie silnikami i obroty wektorowe (0x01 ... 0x04)
Typowy format jazdy przyporządkowuje jako stery pierwszy bajt (`0x01`), za którym przypisywana jest odpowiednia prędkość niezależnego podsystemu gąsienic: lewego a w dalszej obudowie prawego. Wartości podawane w systemie heksadecymalnym odpowiadają po przekonwertowaniu dziesiętnemu układowi do prędkości wyjściowej `100`.
Wzór na ułożenie: `[0x01, moc_lewa, moc_prawa, flaga_swiatel]`
```plaintext
Przód (wolno):      [0x01, 0x32, 0x32, 0x00]  (Cmd=1, L=50, R=50)
Przód (szybko):     [0x01, 0x64, 0x64, 0x00]  (Cmd=1, L=100, R=100)
Tył (wolno):        [0x02, 0x32, 0x32, 0x00]  (Cmd=2 - hipoteza na mod jazdy tylniej)
Obrót (Lewo):       [0x03, 0x64, 0x00, 0x00]  (Obrót czołgowy lewostronny L=100)
Obrót (Prawo):      [0x04, 0x64, 0x00, 0x00]  (Obrót czołgowy prawostronny L=100)
```

#### Moduły manualne: Światła / Klakson
Proste przełączniki operują inną podstawą polecenia w zerowym bajcie tablicy.
```plaintext
Włączenie świateł:  [0x10, 0x01, 0x00, 0x00]
Wyłączenie świateł: [0x10, 0x00, 0x00, 0x00]
Klakson (z sygnałem dźwiękowym):   [0x20, 0x01, 0x00, 0x00]
```

### 4. Podsumowanie sterowania
Rzeczywiste połączenie opiera się na **cyklicznym spammowaniu (minimum co 100 milisekund) 16-bajtowych wektorów operacyjnych** odczytujących z widgetu ekranowego odpowiednią pozycję dla trybu jazdy dyferencjalnej silników. Podobnie, podczas puszczenia d-pada przesyłany zostaje pożegnalny komunikat `0x00` przerywający nadawanie sygnałów. Zmusza to auto do zatrzymania się. 
