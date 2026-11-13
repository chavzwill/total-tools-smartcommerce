import {it,expect} from 'vitest';
import {matchMobileTotpCounter} from '../../smartcommerce-ai/api/account-mfa';
it('verifies a known SHA1 TOTP vector with the existing six-digit policy',()=>{
 expect(matchMobileTotpCounter('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ','287082',59000)).toBe(1);
 expect(matchMobileTotpCounter('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ','000000',59000)).toBeNull();
 expect(matchMobileTotpCounter('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ','287082',180000)).toBeNull();
});
