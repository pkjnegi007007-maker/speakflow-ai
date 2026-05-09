import { motion } from 'motion/react';

interface VoiceWaveformProps {
  isActive: boolean;
}

export function VoiceWaveform({ isActive }: VoiceWaveformProps) {
  return (
    <div className="flex items-end justify-center gap-2 h-12">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className={`w-2 rounded-full ${i === 2 ? 'bg-white' : 'bg-indigo-400/80'}`}
          animate={{
            height: isActive ? [12, 40, 20, 48, 16][i] : 8,
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );
}
