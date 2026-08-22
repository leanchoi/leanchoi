/**
 * Widget de clima y hora: temperatura real de Esquel, ícono de la condición y el
 * reloj local (UTC-3). Si el proveedor está caído, el dato queda marcado como
 * estimado y se ve en rojo: preferimos avisar antes que mentir el clima.
 */

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Wind,
} from 'lucide-react';
import type { WeatherCondition } from '@esquel/shared';
import { useGameStore } from '../../state/gameStore.ts';

const ICONS: Readonly<Record<WeatherCondition, typeof Sun>> = {
  despejado: Sun,
  parcial: CloudSun,
  nublado: Cloud,
  niebla: CloudFog,
  llovizna: CloudDrizzle,
  lluvia: CloudRain,
  nieve: CloudSnow,
  aguanieve: CloudSnow,
  tormenta: CloudLightning,
  viento_fuerte: Wind,
};

const LABELS: Readonly<Record<WeatherCondition, string>> = {
  despejado: 'Despejado',
  parcial: 'Parcialmente nublado',
  nublado: 'Nublado',
  niebla: 'Niebla',
  llovizna: 'Llovizna',
  lluvia: 'Lluvia',
  nieve: 'Nieve',
  aguanieve: 'Aguanieve',
  tormenta: 'Tormenta',
  viento_fuerte: 'Viento fuerte',
};

export const WeatherClockWidget = (): JSX.Element => {
  const weather = useGameStore((s) => s.weather);
  const clock = useGameStore((s) => s.clock);
  const Icon = ICONS[weather.condition] ?? Cloud;

  return (
    <div className="hud-panel weather-widget" aria-label="Clima y hora de Esquel">
      <div className="weather-widget__icon">
        <Icon size={26} strokeWidth={2.5} aria-hidden />
      </div>
      <div>
        <div className="weather-widget__temp">
          {Math.round(weather.temperatureC)}°C
          <span className="weather-widget__clock"> · {clock.localTime}</span>
        </div>
        <div className="weather-widget__cond">{LABELS[weather.condition]}</div>
        <div className="weather-widget__meta">
          ST {Math.round(weather.feelsLikeC)}° · viento {Math.round(weather.windKph)} km/h
          {weather.windGustKph >= 70 ? ` (ráfagas ${Math.round(weather.windGustKph)})` : ''}
        </div>
        <div className="weather-widget__meta">
          Sale {clock.sunrise} · se pone {clock.sunset}
          {weather.stale ? <span className="weather-widget__stale"> · estimado</span> : null}
        </div>
      </div>
    </div>
  );
};
