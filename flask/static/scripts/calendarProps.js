// Determina il range di date valido in base al periodo dell'anno
export function getValidDateRange() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    if (currentMonth >= 9) { // Da settembre a dicembre
      return {
        start: `${currentYear + 1}-01-01`,
        end: `${currentYear + 2}-04-30`
      };
    } else { // Da gennaio ad agosto
      return {
        start: `${currentYear}-01-01`,
        end: `${currentYear + 1}-04-30`
      };
    }
}

// Funzione per generare un colore hex da una stringa
export function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xFF;
      const adjustedValue = Math.min(((value + 127) % 255), 200);
      color += ('00' + adjustedValue.toString(16)).substr(-2);
    }
    return color;
}
