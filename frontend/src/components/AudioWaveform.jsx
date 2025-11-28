import { useEffect, useRef, useState } from 'react';

export default function AudioWaveform({ audioElement, isPlaying }) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const [audioContext, setAudioContext] = useState(null);

  useEffect(() => {
    if (!audioElement || !audioElement.current) return;

    const audio = audioElement.current;
    let context = audioContext;
    let analyser = analyserRef.current;

    // Crea AudioContext se non esiste
    if (!context) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        context = new AudioContextClass();
        setAudioContext(context);
      } catch (error) {
        console.error('Error creating AudioContext:', error);
        return;
      }
    }

    // Crea AnalyserNode se non esiste
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = 256; // Ridotto per performance
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
    }

    // Crea source e connetti
    let source;
    const connectAudio = () => {
      try {
        if (audio.src) {
          source = context.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(context.destination);
        }
      } catch (error) {
        // Potrebbe essere già connesso
        console.warn('Audio already connected or error:', error);
      }
    };

    connectAudio();

    // Crea data array per i dati dell'analizzatore
    const bufferLength = analyser.frequencyBinCount;
    if (!dataArrayRef.current) {
      dataArrayRef.current = new Uint8Array(bufferLength);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      if (!analyser || !isPlaying) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      analyser.getByteFrequencyData(dataArrayRef.current);
      const dataArray = dataArrayRef.current;

      // Pulisci canvas
      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, width, height);

      // Disegna barre waveform
      const barCount = Math.min(60, bufferLength); // Limita a 60 barre per performance
      const barWidth = width / barCount;
      const barGap = barWidth * 0.2;

      ctx.fillStyle = 'var(--accent, #1db954)';

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const barHeight = (dataArray[dataIndex] / 255) * height * 0.8;

        const x = i * barWidth + barGap / 2;
        const y = height - barHeight;

        // Disegna barra con arrotondamento
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth - barGap, barHeight, 2);
        ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    // Avvia animazione
    draw();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (source) {
        try {
          source.disconnect();
        } catch (e) {
          // Ignora errori di disconnessione
        }
      }
    };
  }, [audioElement, isPlaying, audioContext]);

  // Resize canvas quando cambia dimensione
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio || 1;
      canvas.height = rect.height * window.devicePixelRatio || 1;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="audio-waveform"
      style={{
        width: '100%',
        height: '40px',
        display: 'block',
      }}
    />
  );
}

