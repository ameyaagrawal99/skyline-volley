# Skyline Volley

A portrait, real-time beach volleyball game for desktop and mobile browsers. It supports a focused 1v1 duel or an arcade 3v3 squad match with smart player switching, three CPU levels, selectable uniforms, sound, crowd energy, wind, scorekeeping, match logs, and celebration effects.

## Play locally

```bash
npm install
npm run dev
```

Open the printed local URL, choose your mode, difficulty, controls, and kit, then select **Play CPU**.

## Play online

Deploy the repository to GitHub Pages. One player chooses **Create online match** and sends the generated invite link to the other player. Online room discovery uses PeerJS; live gameplay travels directly between the two browsers when possible.

## Play without internet on the same Wi-Fi

On one computer:

```bash
npm install
npm run lan
```

Keep the terminal open. It prints a `Same Wi-Fi` address such as `http://192.168.1.20:4173`. Both players open that address, the host chooses **Create LAN**, and shares the generated room link. Your firewall may ask for permission the first time.

## Controls

- **Floating thumb:** drag anywhere on your half of the court. The joystick appears under your thumb.
- **Tap to move:** tap any reachable point on your half and the controlled player runs there.
- **Classic pad:** use the fixed on-screen direction and action buttons.
- Keyboard movement: WASD or arrow keys
- Jump: Space
- Bump / serve: Z or Enter
- Spike: X while jumping near the ball
- Smart action: use the large round **Serve / Hit / Spike / Block** orb and the game picks the relevant action.
- In 3v3, control automatically switches to the teammate best positioned for the ball; the other two cover the court.

## Rules in this adaptation

- First to 15 points, win by two
- Up to three contacts per side
- A fourth touch, net hit, or out ball is a fault
- The 1v1 duel is a compact arcade adaptation. The optional 3v3 squad mode is also an arcade variant; official beach volleyball is normally 2v2.
- No side changes or rotation in this quick-play version

## Deploy to GitHub Pages

1. Push the repository to a GitHub repository.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Push to `main`; the included workflow builds and publishes the game.

The static GitHub Pages build provides online PeerJS play. Offline Wi-Fi play uses the included local server because browsers need a machine on the network to introduce the two players when the internet is unavailable.
