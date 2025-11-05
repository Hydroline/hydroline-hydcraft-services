import { motdToHtml } from './motd';

describe('motd', () => {
  describe('motdToHtml', () => {
    it('should parse legacy string motd with color codes', () => {
      const motd = '§cHello §aWorld';
      const expected =
        '<span style="color: #FF5555">Hello </span><span style="color: #55FF55">World</span>';
      expect(motdToHtml(motd)).toBe(expected);
    });

    it('should parse json motd', () => {
      const motd = {
        text: 'Hello ',
        color: '#FF5555',
        extra: [{ text: 'World', color: '#55FF55' }],
      };
      const expected =
        '<span style="color: #FF5555">Hello </span><span style="color: #55FF55">World</span>';
      expect(motdToHtml(motd)).toBe(expected);
    });
  });
});
