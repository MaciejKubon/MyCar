# MyCar 🏎️💨

MyCar to eksperymentalna, unikalna aplikacja napisana w środowisku **React Native (Expo)** do zaawansowanego sterowania pojazdami z klocków **CaDA** ze specjalnym naciskiem na modele klasy PC (identyfikator płyty `0xFFF0`). 

Aplikacja całkowicie odrzuca standardowy, zamknięty system oficjalnej nakładki. Wykorzystuje techniki Reverse-Engineeringu oraz protokół **Connectionless BLE Advertising (Atak Replay)**, aby bez bezpośredniego autoryzowanego parowania i wymiany kluczy zmuszać auto do wykonywania pożądanych akcji.

---

## 🔥 Główne funkcje i Tryby Pracy

Projekt przeszedł ogromną ewolucję i obecnie posiada wielowarstwową nawigację prowadzącą gracza od "Garażu" po w pełni autonomiczne systemy sterowania.

### 🎮 Sterowanie Ręczne (D-Pad)
Ulepszony, niezwykle czuły interfejs bazujący na dyskretnych wciśnięciach z wbudowanym pomijaniem *rate-limitera* BLE. Pozwala na prowadzenie samochodu klasycznymi "strzałkami" krzyżaka przy błyskawicznej reakcji sprzętu na puszczenie wirtualnego klawisza hamulca.

### 🧩 Autopilot (Programowanie Klockowe)
Edukacyjny i użyteczny system kolejkowania instrukcji niczym w programie *Scratch*.
* Przeciągasz klocki na listę poleceń i z precyzją co do kilkuset milisekund ustalasz czasy wtrysku konkretnych pakietów (np. Jedź 2 sekundy, skręć w prawo przez 0.5 sec). 
* Interpreter wykonuje sekwencję synchronicznie i tworzy autonomiczne manewry auta.

### 🖌️ Płótno Rysika (Draw Screen / Dead Reckoning)
Nowatorski, eksperymentalny system odczytujący wektory rysowane palcem na smartfonie (`react-native-svg`), przeliczający krzywizny oraz skosy matematycznie na czasy załączania bocznych silników skrętu i głównego napędu. Cały skomplikowany wzór z ekranu jest re-interpretowany na rzeczywistą jadę maszyną w pokoju.

---

## 🛠️ Architektura i Stack Technologiczny

* **React Native & Expo API 54+**
* **Nawigacja**: `@react-navigation/native-stack` oraz `bottom-tabs`
* **Transmisja BLE Nadawanie**: Zmodyfikowana w źródłach biblioteka `react-native-ble-advertiser`. Wymusza pakiety 24-bajtowe jako `Manufacturer Specific Data` bez nadawania adresu UUID.
* **Transmisja BLE Odbiór**: `react-native-ble-plx` (jako komponent `Scanner` do identyfikacji zabawek w eterze i wyłapywania adresów MAC).
* **UI/UX**: Customowy Dark Mode stylizowany na interfejs glassmorphism (neonowe fiolety i zgniłe zielenie). Wyeliminowanie Expo Splash na rzecz w pełni natywnej, sprzętowo renderowanej animacji wybudzania `SplashScreen.tsx`.

---

## 🚀 Jak uruchomić (Instrukcja dla programisty)

Aplikacja używa mocno wbudowanych, natywnych bibliotek (C++/Java) do generowania na żywo przebiegów wektorowych SVG oraz wysyłania impulsów radiowych Bluetooth poniżej strefy API Androida, dlatego **uruchamianie w samej chmurze Expo Go (na tzw. sucho) nie zadziała**.

1. Klonuj repozytorium:
   ```bash
   git clone https://github.com/MaciejKubon/MyCar.git
   cd MyCar
   ```
2. Zainstaluj zależności:
   ```bash
   npm install
   ```
3. Podepnij urządzenie deweloperskie Androida (lub emulator z dostępem do radia BLE) przewodem po USB. Zbuduj natywną warstwę i kod JS:
   ```bash
   npx expo run:android
   ```
   *(Uwaga: w związku z rygorystycznymi uprawnieniami Android 12+, zaakceptuj wszystkie zapytania o Lokalizację oraz Urządzenia W Poblizu przy pierwszym uruchomieniu po przebudowie).*

---

## 🔬 Jak to działa pod maską? (Dla dociekliwych)

1. Auto CaDA podczas włączenia szuka autoryzacji w sposób pasywny. Aplikacja udaje telefon oficjalny (Omija proces Hash Handshake'u).
2. Wykryliśmy, że płyta o ID Producenta `0xFFF0` (komunikatywnie 65520) nie posiada zabezpieczeń w postaci kodu zmiennego w ramce czasu (*rolling-codes*). 
3. Baza komend (`src/utils/commands.ts`) to wyrwany wprost z logów HCI `btsnoop_hci.log` oryginalny 24-bajtowy wtrysk (Hex Payload). Zawiera niezmienną część sesji i flagę zwrotną. 
4. Kod non stop iteruje przez pętle interwałową odrzucając pakiet co 100 ms – dopóki palec dotyka ekranu/funkcja trwa. Skróciliśmy wirtualne ramię zatrzymujące ucinając *Timeouty* sprzętowe, co zaowocowało redukcją laga o ponad 50%.

---

*Zbudowane z pasją do zabawek inżynieryjnych i React Native'a. Szerokiej drogi!* 🛣️
