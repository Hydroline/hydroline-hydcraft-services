import { isValidPlayerName } from './player-name';

describe('player-name', () => {
  describe('isValidPlayerName', () => {
    it('should return true for a valid player name', () => {
      expect(isValidPlayerName('jeb_')).toBe(true);
    });

    it('should return true for a short player name', () => {
      expect(isValidPlayerName('abc')).toBe(true);
    });

    it('should return true for a long player name', () => {
      expect(isValidPlayerName('1234567890123456')).toBe(true);
    });

    it('should return false for a name that is too short', () => {
      expect(isValidPlayerName('a')).toBe(false);
    });

    it('should return false for a name that is too long', () => {
      expect(isValidPlayerName('12345678901234567')).toBe(false);
    });

    it('should return false for a name with invalid characters', () => {
      expect(isValidPlayerName('Notch!')).toBe(false);
    });
  });
});
