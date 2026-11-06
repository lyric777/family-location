import FamilyLocation from '../../../modules/family-location';

export type OwnerRevocationStatement = {
  version: 1;
  action: 'revoke';
  familyId: string;
  ownerDeviceId: string;
  memberDeviceId: string;
  keyEpoch: number;
};

export function ownerRevocationMessage(statement: OwnerRevocationStatement): string {
  return JSON.stringify([
    'family-revocation-v1',
    statement.familyId,
    statement.ownerDeviceId,
    statement.memberDeviceId,
    statement.keyEpoch,
  ]);
}

export async function verifyOwnerRevocation(
  statement: OwnerRevocationStatement,
  signature: string,
  expected: {
    familyId: string;
    ownerDeviceId: string;
    ownerPublicKey: string;
    memberDeviceId: string;
    minimumEpoch: number;
  },
): Promise<boolean> {
  if (statement.version !== 1 || statement.action !== 'revoke' ||
      statement.familyId !== expected.familyId ||
      statement.ownerDeviceId !== expected.ownerDeviceId ||
      statement.memberDeviceId !== expected.memberDeviceId ||
      !Number.isSafeInteger(statement.keyEpoch) ||
      statement.keyEpoch <= expected.minimumEpoch ||
      !expected.ownerPublicKey || !signature) return false;

  const fingerprint = await FamilyLocation.sha256HexBase64(expected.ownerPublicKey);
  if ('dev_' + fingerprint !== expected.ownerDeviceId) return false;
  return FamilyLocation.verifyIdentitySignature(
    expected.ownerPublicKey,
    ownerRevocationMessage(statement),
    signature,
  );
}
