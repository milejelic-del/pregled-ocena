# Pregled ocena (Android)

Mobilna aplikacija koja se prijavljuje na **moj.esdnevnik.rs** (nalogom roditelja ili učenika) i pregledno prikazuje ocene za **aktuelni razred**:

- prosek, broj ocena po vrednosti, poslednje ocene, upozorenje za predmete sa prosekom ispod 2,50
- kartica za svaki predmet: ocene za I i II polugodište, prosek, zaključna ocena
- dodir na predmet otvara detalje (datum, vrsta provere, napomena nastavnika)
- više škola u istoj godini (npr. redovna i muzička) su na karticama, ranije godine su u meniju
- povlačenje nadole osvežava ocene

## Instalacija na Android telefon

1. Preuzmite `pregled-ocena.apk` (stranica **Releases → latest** u ovom repozitorijumu).
2. Otvorite fajl na telefonu. Android će tražiti dozvolu „Instaliraj nepoznate aplikacije“ za pregledač ili Fajlove: dozvolite je samo za ovu instalaciju.
3. Pokrenite „Pregled ocena“ i unesite korisničko ime i lozinku sa portala.

APK se automatski pravi na GitHubu (`.github/workflows/android-apk.yml`) pri svakoj izmeni na grani `main`.
Alternativa: `npx eas-cli build -p android --profile preview` (potreban besplatan Expo nalog).

## Kredencijali i bezbednost

- Lozinka se šalje **samo** portalu moj.esdnevnik.rs.
- Opcija „Zapamti“ čuva podatke u **zaštićenom sefu telefona** (Android Keystore, preko `expo-secure-store`), ne u običnom fajlu. Dugme „Obriši podatke“ ih briše.
- Aplikacija nema svoj server: podaci idu direktno sa telefona na portal. Rezervne kopije aplikacije (backup) su isključene.

## Kako radi

Portal nema javni API. Aplikacija radi isto što i pregledač: otvori `/login`, uzme skriveni `_token`, pošalje korisničko ime i lozinku, pa sa istom sesijom čita `/api/students` i `/api/grades/{id}`.

## Razvoj

```
npm ci
npm run typecheck
npm test            # potreban lažni portal na 127.0.0.1:5077 (tests/run_mock_portal.py)
npx expo start      # probni rad preko Expo Go
```
