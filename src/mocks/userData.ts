export interface UserProfile {
  id: string;
  email: string;
  name: string;
  isAuthenticated: boolean;
  preferences: {
    allowFutureContent: boolean;
    animationsEnabled: boolean;
    companionVoice: 'patient' | 'concise';
  };
}

export const mockUser: UserProfile = {
  id: 'usr_mock_101',
  email: 'learner@example.com',
  name: 'Alex Rivera',
  isAuthenticated: true,
  preferences: {
    allowFutureContent: false,
    animationsEnabled: true,
    companionVoice: 'patient',
  },
};
