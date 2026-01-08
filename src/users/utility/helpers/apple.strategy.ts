import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err, undefined);

    if (!key) {
      return callback(new Error('Unable to get signing key'), undefined);
    }

    const signingKey = key.getPublicKey();
    if (!signingKey) {
      return callback(new Error('Signing key is undefined'), undefined);
    }

    callback(null, signingKey);
  });
}

export async function verifyAppleToken(identityToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      identityToken,
      getKey,
      {
        issuer: 'https://appleid.apple.com',
      },
      (err, decoded: any) => {
        if (err) return reject(err);

        // ✅ Ajouter tous les audiences possibles
        const allowedAudiences = [
          'com.favorgroup.favorseller', // ancienne app mobile
          'com.favorgroup.favorhelp',   // app actuelle / Postman
          'com.favorgroup.web',         // web / Service ID
        ];

        if (!allowedAudiences.includes(decoded.aud)) {
          return reject(new Error(`Invalid audience: ${decoded.aud}`));
        }

        resolve(decoded);
      },
    );
  });
}
