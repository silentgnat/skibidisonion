import './style.css';
import { Game } from './game/Game.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) {
  throw new Error('Canvas element #game not found');
}

const game = new Game(canvas);
game.start();
