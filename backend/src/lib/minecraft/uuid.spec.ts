import { isValidUuid, addUuidDashes, removeUuidDashes } from './uuid';

describe('uuid', () => {
  const dashed = 'c3a75968-f5df-488b-9865-4a61329a2861';
  const undashed = 'c3a75968f5df488b98654a61329a2861';

  describe('isValidUuid', () => {
    it('should return true for valid dashed UUID', () => {
      expect(isValidUuid(dashed)).toBe(true);
    });
    it('should return true for valid undashed UUID', () => {
      expect(isValidUuid(undashed)).toBe(true);
    });
    it('should return false for invalid UUID', () => {
      expect(isValidUuid('invalid-uuid')).toBe(false);
    });
  });

  describe('addUuidDashes', () => {
    it('should add dashes to an undashed UUID', () => {
      expect(addUuidDashes(undashed)).toBe(dashed);
    });
    it('should return original string if already dashed', () => {
      expect(addUuidDashes(dashed)).toBe(dashed);
    });
  });

  describe('removeUuidDashes', () => {
    it('should remove dashes from a dashed UUID', () => {
      expect(removeUuidDashes(dashed)).toBe(undashed);
    });
    it('should return original string if already undashed', () => {
      expect(removeUuidDashes(undashed)).toBe(undashed);
    });
  });
});
