import { MessageSquare, Briefcase, Users, Speech, Heart, GraduationCap, Headset, MessageCircle } from 'lucide-react';
import { ReactNode } from 'react';

export interface Scenario {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  category: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'casual',
    title: 'Casual Conversation',
    description: 'Practice everyday small talk and meeting new people.',
    icon: <MessageSquare className="w-6 h-6" />,
    category: 'Social'
  },
  {
    id: 'interview',
    title: 'Job Interview',
    description: 'Sharpen your responses to common interview questions.',
    icon: <Briefcase className="w-6 h-6" />,
    category: 'Professional'
  },
  {
    id: 'public-speaking',
    title: 'Public Speaking',
    description: 'Practice delivery and clarity for presentations.',
    icon: <Speech className="w-6 h-6" />,
    category: 'Professional'
  },
  {
    id: 'group-discussion',
    title: 'Group Discussion',
    description: 'Learn to contribute effectively in meetings.',
    icon: <Users className="w-6 h-6" />,
    category: 'Social'
  },
  {
    id: 'dating',
    title: 'Dating Confidence',
    description: 'Build confidence for romantic conversations.',
    icon: <Heart className="w-6 h-6" />,
    category: 'Personal'
  },
  {
    id: 'fluency',
    title: 'English Fluency',
    description: 'Focus on flow and natural usage of English.',
    icon: <GraduationCap className="w-6 h-6" />,
    category: 'Skill'
  },
  {
    id: 'customer',
    title: 'Customer Communication',
    description: 'Practice empathy and problem solving.',
    icon: <Headset className="w-6 h-6" />,
    category: 'Professional'
  },
  {
    id: 'debate',
    title: 'Debate Practice',
    description: 'Formulate strong arguments and rebuttals.',
    icon: <MessageCircle className="w-6 h-6" />,
    category: 'Skill'
  }
];
