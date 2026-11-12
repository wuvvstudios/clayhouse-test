# Clayhouse test builds

Test builds of Clayhouse games by Wuvv Studios. Concept by vonnivision.

- `motion/`: the TV or laptop screen for the phone-controller games (Saber, Blaster Run).
- `motion/pad.html`: the phone controller page. Open it on the phone, or scan the QR code on the screen.

Bundled libraries in `motion/lib/` are open source and keep their own license headers: three.js (MIT), PeerJS (MIT), qrcode-generator (MIT).

## More games

- Laser Tag: `motion/lasertag.html`. One phone is the controller (aim and fire), a second phone can be the board (lay it flat and lean to move). Mouse and keys work too.
- Red Light, Green Light: `motion/redlight.html`. Camera or keyboard, 1 to 4 players.

Every character is the Clayhouse action figure (`motion/lib/clayfigure*.js`, `motion/lib/clayavatar.js`).

## Home screen

The site's front page (`index.html`) is the Clay Arcade with the vintage home screen: every game in its own action-figure box, sorted by Sports, Action, Party and Racing. Camera games open the Arcade's player setup; phone games open their page in `motion/`. Music files are not online, so the Arcade plays without music here.
