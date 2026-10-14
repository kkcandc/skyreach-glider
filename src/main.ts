import { Game } from './game/Game';

const BUILD = 'glide-feel-d325fe8';
console.info(`[SKYREACH] build ${BUILD}`);

const canvas = document.getElementById('view') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;

requestAnimationFrame(() => {
  const game = new Game(canvas);
  boot.hidden = true;

  const begin = (where: 'harbor' | 'crown') => {
    canvas.requestPointerLock();
    game.start(where);
  };
  document.getElementById('start-walk')!.addEventListener('click', () => begin('harbor'));
  document.getElementById('start-crown')!.addEventListener('click', () => begin('crown'));
  document.getElementById('resume')!.addEventListener('click', () => {
    game.resume();
    canvas.requestPointerLock();
  });
  document.getElementById('reset')!.addEventListener('click', () => game.resetProgress());

  const time = document.getElementById('time-slider') as HTMLInputElement;
  const sens = document.getElementById('sens-slider') as HTMLInputElement;
  const invert = document.getElementById('invert') as HTMLInputElement;
  const auto = document.getElementById('auto-cycle') as HTMLInputElement;
  time.addEventListener('input', () => game.setTime(Number(time.value)));
  sens.addEventListener('input', () => game.setSens(Number(sens.value)));
  invert.addEventListener('change', () => game.setInvert(invert.checked));
  auto.addEventListener('change', () => game.setAuto(auto.checked));

  document.addEventListener('pointerlockchange', () => {
    game.onPointerLock(document.pointerLockElement === canvas);
  });

  const jump = document.getElementById('t-jump')!;
  const glide = document.getElementById('t-glide')!;
  const hold = (el: HTMLElement, code: string) => {
    const down = (e: Event) => {
      e.preventDefault();
      game.press(code, true);
    };
    const up = (e: Event) => {
      e.preventDefault();
      game.press(code, false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
  };
  hold(jump, 'TouchJump');
  hold(glide, 'TouchGlide');
});
