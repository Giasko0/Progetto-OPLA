// Determina il range di date valido in base al periodo dell'anno
export function getValidDateRange() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    let startYear, endYear;
    if (currentMonth >= 9) {
        startYear = currentYear + 1;
        endYear = currentYear + 2;
    } else {
        startYear = currentYear;
        endYear = currentYear + 1;
    }

    return {
        start: `${startYear}-01-01`,  // Inizia esattamente dal 1° gennaio
        end: `${endYear}-04-30`       // Finisce il 30 aprile
    };
}