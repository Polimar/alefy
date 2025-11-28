import { useEffect, useRef } from 'react';
import usePlayerStore from '../store/playerStore';
import { X, Sliders } from 'lucide-react';
import './EqualizerPanel.css';

const PRESETS = {
  flat: { name: 'Piatto', bass: 0, mid: 0, treble: 0 },
  pop: { name: 'Pop', bass: 4, mid: 2, treble: 3 },
  rock: { name: 'Rock', bass: 5, mid: 3, treble: 2 },
  jazz: { name: 'Jazz', bass: 3, mid: 4, treble: 3 },
  classical: { name: 'Classico', bass: 2, mid: 3, treble: 4 },
  bass: { name: 'Bassi', bass: 8, mid: 1, treble: 0 },
  treble: { name: 'Alti', bass: 0, mid: 1, treble: 8 },
};

export default function EqualizerPanel({ audioElement }) {
  const { equalizerSettings, showEqualizer, setEqualizerSettings, toggleEqualizer } = usePlayerStore();
  const audioContextRef = useRef(null);
  const bassFilterRef = useRef(null);
  const midFilterRef = useRef(null);
  const trebleFilterRef = useRef(null);
  const gainNodeRef = useRef(null);

  useEffect(() => {
    if (!audioElement?.current || !showEqualizer) return;

    const audio = audioElement.current;
    let context = audioContextRef.current;

    // Crea AudioContext se non esiste
    if (!context) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        context = new AudioContextClass();
        audioContextRef.current = context;
      } catch (error) {
        console.error('Error creating AudioContext for equalizer:', error);
        return;
      }
    }

    // Crea filtri e gain node se non esistono
    if (!bassFilterRef.current) {
      // Filtro passa-basso per i bassi (fino a ~250Hz)
      const bassFilter = context.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 250;
      bassFilter.gain.value = 0;
      bassFilterRef.current = bassFilter;

      // Filtro passa-banda per i medi (250Hz - 4kHz)
      const midFilter = context.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1;
      midFilter.gain.value = 0;
      midFilterRef.current = midFilter;

      // Filtro passa-alto per gli alti (da 4kHz)
      const trebleFilter = context.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 4000;
      trebleFilter.gain.value = 0;
      trebleFilterRef.current = trebleFilter;

      // Gain node per controllo volume complessivo
      const gainNode = context.createGain();
      gainNode.gain.value = 1;
      gainNodeRef.current = gainNode;

      // Connetti i filtri in serie
      bassFilter.connect(midFilter);
      midFilter.connect(trebleFilter);
      trebleFilter.connect(gainNode);
      gainNode.connect(context.destination);
    }

    // Applica le impostazioni dell'equalizzatore
    if (equalizerSettings.enabled) {
      bassFilterRef.current.gain.value = equalizerSettings.bass;
      midFilterRef.current.gain.value = equalizerSettings.mid;
      trebleFilterRef.current.gain.value = equalizerSettings.treble;
    } else {
      bassFilterRef.current.gain.value = 0;
      midFilterRef.current.gain.value = 0;
      trebleFilterRef.current.gain.value = 0;
    }
  }, [audioElement, showEqualizer, equalizerSettings]);

  const handlePresetChange = (presetKey) => {
    const preset = PRESETS[presetKey];
    if (preset) {
      setEqualizerSettings({
        enabled: true,
        preset: presetKey,
        bass: preset.bass,
        mid: preset.mid,
        treble: preset.treble,
      });
    }
  };

  const handleSliderChange = (type, value) => {
    setEqualizerSettings({
      ...equalizerSettings,
      enabled: true,
      preset: 'custom',
      [type]: parseFloat(value),
    });
  };

  const toggleEnabled = () => {
    setEqualizerSettings({
      ...equalizerSettings,
      enabled: !equalizerSettings.enabled,
    });
  };

  if (!showEqualizer) return null;

  return (
    <div className={`equalizer-panel ${showEqualizer ? 'show' : ''}`}>
      <div className="equalizer-header">
        <div className="equalizer-header-title">
          <Sliders size={20} />
          <h3>Equalizzatore</h3>
        </div>
        <button onClick={toggleEqualizer} className="equalizer-close-btn">
          <X size={20} />
        </button>
      </div>
      <div className="equalizer-content">
        <div className="equalizer-toggle">
          <label className="equalizer-toggle-label">
            <input
              type="checkbox"
              checked={equalizerSettings.enabled}
              onChange={toggleEnabled}
            />
            <span>Abilita equalizzatore</span>
          </label>
        </div>

        <div className="equalizer-presets">
          <label>Preset:</label>
          <div className="preset-buttons">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                className={`preset-btn ${equalizerSettings.preset === key ? 'active' : ''}`}
                onClick={() => handlePresetChange(key)}
                disabled={!equalizerSettings.enabled}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="equalizer-controls">
          <div className="eq-control">
            <label>Bassi</label>
            <div className="eq-slider-container">
              <span className="eq-label-left">-12</span>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={equalizerSettings.bass}
                onChange={(e) => handleSliderChange('bass', e.target.value)}
                disabled={!equalizerSettings.enabled}
                className="eq-slider"
              />
              <span className="eq-label-right">+12</span>
              <span className="eq-value">{equalizerSettings.bass > 0 ? '+' : ''}{equalizerSettings.bass}dB</span>
            </div>
          </div>

          <div className="eq-control">
            <label>Medi</label>
            <div className="eq-slider-container">
              <span className="eq-label-left">-12</span>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={equalizerSettings.mid}
                onChange={(e) => handleSliderChange('mid', e.target.value)}
                disabled={!equalizerSettings.enabled}
                className="eq-slider"
              />
              <span className="eq-label-right">+12</span>
              <span className="eq-value">{equalizerSettings.mid > 0 ? '+' : ''}{equalizerSettings.mid}dB</span>
            </div>
          </div>

          <div className="eq-control">
            <label>Alti</label>
            <div className="eq-slider-container">
              <span className="eq-label-left">-12</span>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={equalizerSettings.treble}
                onChange={(e) => handleSliderChange('treble', e.target.value)}
                disabled={!equalizerSettings.enabled}
                className="eq-slider"
              />
              <span className="eq-label-right">+12</span>
              <span className="eq-value">{equalizerSettings.treble > 0 ? '+' : ''}{equalizerSettings.treble}dB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

