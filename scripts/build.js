import {mkdir,copyFile,cp} from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const file of ['index.html','privacy.html','robots.txt','sitemap.xml'])await copyFile(file,`public/${file}`);
await cp('assets','public/assets',{recursive:true});
