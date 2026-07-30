import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadSignalContacts,
  saveSignalContact,
  setSignalContactFollowed,
} from './contacts';

describe('Signal local contacts', () => {
  afterEach(async () => AsyncStorage.clear());

  it('keeps follows and address book entries device-local', async () => {
    await saveSignalContact({
      identityId: 'jbi1amina',
      displayName: 'Amina',
      lxmfDestinationHash: 'aa'.repeat(16),
      rnsPublicKey: 'AQ==',
      followed: false,
      messagedAtMs: null,
      savedAtMs: 1,
    });
    await setSignalContactFollowed('jbi1amina', true);
    await expect(loadSignalContacts()).resolves.toMatchObject([{ identityId: 'jbi1amina', followed: true }]);
  });
});
