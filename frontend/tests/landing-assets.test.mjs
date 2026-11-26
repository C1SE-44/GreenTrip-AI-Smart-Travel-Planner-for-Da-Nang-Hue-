import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
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

test('trip cover images use destination-specific local fallbacks for broken or unsafe URLs',async()=>{
  const source=readFileSync(path.join(root,'src/components/explore/exploreUtils.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {getTripCoverFallback,resolveTripCoverImage}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

  const danang='/images/landing/danang-hero-640.webp';
  const hue='/images/landing/hue-hero-640.webp';
  const central='/images/danang_hue_banner.jpg';
  for(const asset of [danang,hue,central]) assert.ok(existsSync(path.join(root,'public',asset)),`missing ${asset}`);

  assert.equal(getTripCoverFallback('Đà Nẵng'),danang);
  assert.equal(getTripCoverFallback('Huế'),hue);
  assert.equal(getTripCoverFallback('Đà Nẵng & Huế'),central);
  assert.equal(getTripCoverFallback('Miền Trung'),central);
  assert.equal(getTripCoverFallback('Hue'),hue);

  assert.equal(resolveTripCoverImage(undefined,'Huế'),hue);
  assert.equal(resolveTripCoverImage('  ','Đà Nẵng'),danang);
  assert.equal(resolveTripCoverImage('not a URL','Đà Nẵng & Huế'),central);
  assert.equal(resolveTripCoverImage('//untrusted.example/image.jpg','Huế'),hue);
  assert.equal(resolveTripCoverImage('https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=800','Huế'),hue);
  assert.equal(resolveTripCoverImage('https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800','Đà Nẵng & Huế'),central);
  assert.equal(resolveTripCoverImage('https://example.com/cover.jpg','Huế'),'https://example.com/cover.jpg');
  assert.equal(resolveTripCoverImage('http://example.com/cover.jpg','Đà Nẵng'),'http://example.com/cover.jpg');
  assert.equal(resolveTripCoverImage('/images/custom-cover.jpg','Huế'),'/images/custom-cover.jpg');
});
