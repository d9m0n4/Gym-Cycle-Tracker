import type { Exercise } from '../types';

export const STORAGE_KEY = 'gym-cycle-v2';
export const weekInfo = [
  { name:'Лёгкая', rir:'3–4', desc:'Техника и комфортный запас' },
  { name:'Средняя', rir:'2–3', desc:'Рабочая нагрузка' },
  { name:'Тяжёлая', rir:'1–2', desc:'Тяжело, но без отказа' },
  { name:'Разгрузка', rir:'4–5', desc:'Снизь объём, восстановись' },
];
export const today = () => new Date().toISOString().slice(0,10);
export const epley = (weight:number,reps:number,rir=0) => {
  const effective = Math.max(1,Math.min(12,reps+rir));
  return effective === 1 ? weight : weight * (1 + effective/30);
};

