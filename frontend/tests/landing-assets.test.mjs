import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Studio cards ship complete local artwork within a 3 MB budget',()=>{
  const source=path.join(root,'src/components/landing/studio');
  const assets=path.join(root,'public/images/landing/studio');
  let references=0;
  for(const file of readdirSync(source).filter(f=>f.endsWith('.tsx'))){
    const code=readFileSync(path.join(source,file),'utf8');
    for(const [,url] of code.matchAll(/['"](\/images\/landing\/studio\/[^'" ]+)['"]/g)){
      references++;
      assert.ok(existsSync(path.join(root,'public',url)),`${file}: missing ${url}`);
    }
  }
  assert.ok(references>=30,'all three card illustrations must be present');
  const total=readdirSync(assets).reduce((sum,file)=>sum+statSync(path.join(assets,file)).size,0);
  assert.ok(total<3_000_000,`artwork is ${total} bytes`);
});
