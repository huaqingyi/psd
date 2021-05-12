// export * from './psd';
import { PSD } from './psd';
import { join } from 'path';

const psd = new PSD(join(__dirname, '../test/m8.psd'), {
    output: join(__dirname, '../psds'), 
    // rem: 100,
    // template: join(__dirname, '../tpl/auto-bottom.html'),
});

psd.build();
