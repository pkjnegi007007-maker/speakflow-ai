/**
 * Helper to match standard SpeechSynthesisVoice objects by English accent
 * and generic vocal profiles (man, woman, kid).
 */

export interface VoiceProfile {
  accent: 'default' | 'us' | 'uk' | 'in' | 'au';
  gender: 'default' | 'man' | 'woman' | 'kid';
}

export function getBestMatchingVoice(
  voices: SpeechSynthesisVoice[],
  accent: 'default' | 'us' | 'uk' | 'in' | 'au',
  gender: 'default' | 'man' | 'woman' | 'kid'
): SpeechSynthesisVoice | null {
  const enVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  if (enVoices.length === 0) return null;

  // Filter by Accent first
  let accentVoices = enVoices;
  if (accent !== 'default') {
    const localeMap: Record<string, string[]> = {
      us: ['en-us', 'en-ca'],
      uk: ['en-gb', 'en-ie'],
      in: ['en-in'],
      au: ['en-au', 'en-nz']
    };
    const targets = localeMap[accent] || [];
    accentVoices = enVoices.filter(v => 
      targets.some(target => v.lang.toLowerCase().includes(target))
    );
    if (accentVoices.length === 0) {
      accentVoices = enVoices; // fallback to general english
    }
  }

  // Filter/Sort by Gender
  let genderVoices = accentVoices;
  const femaleKeywords = ['zira', 'samantha', 'tessa', 'moira', 'hazel', 'susan', 'kathy', 'karen', 'veena', 'fiona', 'victoria', 'amelia', 'female', 'ira', 'heera', 'siri', 'tessa'];
  const maleKeywords = ['david', 'george', 'daniel', 'ravi', 'mark', 'male', 'richard', 'microsoft david', 'ravi', 'alex', 'bruce'];

  if (gender === 'man') {
    genderVoices = accentVoices.filter(v => 
      maleKeywords.some(kw => v.name.toLowerCase().includes(kw))
    );
    if (genderVoices.length === 0) {
      // Find anything not explicitly female
      genderVoices = accentVoices.filter(v => 
        !femaleKeywords.some(kw => v.name.toLowerCase().includes(kw))
      );
    }
  } else if (gender === 'woman' || gender === 'kid') {
    // Both target female/lighter voices 
    genderVoices = accentVoices.filter(v => 
      femaleKeywords.some(kw => v.name.toLowerCase().includes(kw))
    );
    if (genderVoices.length === 0) {
      // Find anything not explicitly male
      genderVoices = accentVoices.filter(v => 
        !maleKeywords.some(kw => v.name.toLowerCase().includes(kw))
      );
    }
  }

  if (genderVoices.length > 0) {
    return genderVoices[0];
  }
  return accentVoices[0] || null;
}

/**
 * Returns the customized utterance configuration values for SpeechSynthesis
 */
export function getVoiceUtteranceConfig(
  gender: 'default' | 'man' | 'woman' | 'kid'
) {
  let pitch = 1.0;
  let rateModifier = 1.0;

  switch (gender) {
    case 'man':
      pitch = 0.82; // Deeper masculine tone
      break;
    case 'woman':
      pitch = 1.08; // Slightly higher/clear feminine tone
      break;
    case 'kid':
      pitch = 1.48; // Significantly higher energetic kid tone
      rateModifier = 1.08; // Kids usually speak slightly faster/excitedly
      break;
    default:
      pitch = 1.0;
      break;
  }

  return { pitch, rateModifier };
}
