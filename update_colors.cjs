const fs = require('fs');
const path = require('path');

function replaceWhiteWithStrongText(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceWhiteWithStrongText(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let lines = content.split('\n');
      let changed = false;
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Skip if it contains specific dark/colored backgrounds
        if (
          line.includes('background: \'var(--accent)\'') || 
          line.includes('background: \'var(--emerald)\'') ||
          line.includes('background: \'var(--red)\'') ||
          line.includes('pickGradient') ||
          line.includes('background: \'#fff\'') ||
          line.includes('linear-gradient') ||
          line.includes('background: active ? \'var(--accent)\'')
        ) {
          continue;
        }
        
        // Safely replace '#fff' with 'var(--strong-text)' for text color
        if (line.includes(`color: '#fff'`) || line.includes(`color: "#fff"`)) {
          lines[i] = line.replace(/color: ['"]#fff['"]/g, "color: 'var(--strong-text)'");
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

replaceWhiteWithStrongText(path.join(__dirname, 'src'));
