const { format, addDays, nextDay, isBefore, startOfDay, setHours, setMinutes } = require('date-fns');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDateFromText(texto) {
    const agora = new Date();
    let dataFinal = setMinutes(setHours(agora, 18), 0);
    
    const regexData = /⏰\s*(?:Entrega|Para):\s*(.*)/i;
    const match = texto.match(regexData);
    
    if (!match) return dataFinal.toISOString();
    
    const infoData = match[1].toLowerCase().trim();
    const diasSemana = { 
        'domingo': 0, 'segunda': 1, 'terça': 2, 'terca': 2, 
        'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6 
    };
    
    if (infoData.includes('hoje') || infoData.includes('hj')) { 
        dataFinal = agora; 
    } else if (infoData.includes('amanhã') || infoData.includes('amanha')) { 
        dataFinal = addDays(agora, 1); 
    } else {
        let achouDia = false;
        for (let dia in diasSemana) { 
            if (infoData.includes(dia)) { 
                dataFinal = nextDay(agora, diasSemana[dia]); 
                achouDia = true; 
                break; 
            } 
        }
        
        if (!achouDia) {
            const matchDDMM = infoData.match(/(\d{1,2})[\/\.](\d{1,2})/);
            if (matchDDMM) {
                const dia = parseInt(matchDDMM[1]);
                const mes = parseInt(matchDDMM[2]) - 1;
                const tempDate = new Date(agora.getFullYear(), mes, dia);
                if (tempDate.getDate() === dia && tempDate.getMonth() === mes) {
                    dataFinal = tempDate;
                    if (isBefore(dataFinal, startOfDay(agora))) {
                        dataFinal.setFullYear(agora.getFullYear() + 1);
                    }
                }
            }
        }
    }
    
    const matchHora = infoData.match(/(\d{1,2})[:h](\d{2})?/);
    if (matchHora) {
        const hora = parseInt(matchHora[1]);
        const min = matchHora[2] ? parseInt(matchHora[2]) : 0;
        dataFinal = setMinutes(setHours(dataFinal, hora), min);
    } else { 
        dataFinal = setMinutes(setHours(dataFinal, 18), 0); 
    }
    
    return dataFinal.toISOString();
}

function formatDate(date) {
    return format(new Date(date), 'dd/MM/yyyy HH:mm');
}

module.exports = {
    sleep,
    extractDateFromText,
    formatDate
};