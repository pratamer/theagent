const fs = require('fs');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');

class AgentAPI {
    constructor() {
        this.baseURL = 'https://api.agent301.org';
        this.proxies = fs.readFileSync('proxy.txt', 'utf8').replace(/\r/g, '').split('\n').filter(Boolean);
    }

    headers(authorization) {
        return {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
            'Authorization': authorization,
            'Content-Type': 'application/json',
            'Origin': 'https://telegram.agent301.org',
            'Referer': 'https://telegram.agent301.org/',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        };
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`);
                break;        
            case 'error':
                console.log(`[${timestamp}] [!] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`.blue);
        }
    }

    async waitWithCountdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            const timestamp = new Date().toLocaleTimeString();
            process.stdout.write(`[${timestamp}] [*] Waiting ${i} seconds to continue...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    extractFirstName(authorization) {
        try {
            const params = new URLSearchParams(authorization);
            const userString = params.get('user');
            if (userString) {
                const userObject = JSON.parse(decodeURIComponent(userString));
                return userObject.first_name;
            }
            return 'Unknown';
        } catch (error) {
            this.log(`Cannot read data: ${error.message}`, 'error');
            return 'Unknown';
        }
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error when checking proxy IP: ${error.message}`);
        }
    }

    async getMe(authorization, proxy) {
        const url = `${this.baseURL}/getMe`;
        const payload = {"referrer_id": 376905749};
        const proxyAgent = new HttpsProxyAgent(proxy);
        
        try {
            const response = await axios.post(url, payload, { 
                headers: this.headers(authorization),
                httpsAgent: proxyAgent
            });
            return response.data;
        } catch (error) {
            this.log(`Error getting user information: ${error.message}`, 'error');
            throw error;
        }
    }

    async completeTask(authorization, taskType, taskTitle, currentCount = 0, maxCount = 1, proxy) {
        const url = `${this.baseURL}/completeTask`;
        const payload = { "type": taskType };
        const proxyAgent = new HttpsProxyAgent(proxy);
        
        try {
            const response = await axios.post(url, payload, { 
                headers: this.headers(authorization),
                httpsAgent: proxyAgent
            });
            const result = response.data.result;
            this.log(`Task ${taskTitle.yellow} ${currentCount + 1}/${maxCount} completed successfully | Reward ${result.reward.toString().magenta} | Balance ${result.balance.toString().magenta}`, 'custom');
            return result;
        } catch (error) {
            this.log(`Task ${taskTitle} failed: ${error.message}`, 'error');
        }
    }

    async processTasks(authorization, tasks, proxy) {
        const unclaimedTasks = tasks.filter(task => !task.is_claimed && !['nomis2', 'boost', 'invite_3_friends'].includes(task.type));
        
        if (unclaimedTasks.length === 0) {
            this.log("No uncompleted tasks left.", 'warning');
            return;
        }
    
        for (const task of unclaimedTasks) {
            if (task.max_count) {
                const remainingCount = task.max_count - (task.count || 0);
                for (let i = 0; i < remainingCount; i++) {
                    await this.completeTask(authorization, task.type, task.title, i, remainingCount, proxy);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } else {
                await this.completeTask(authorization, task.type, task.title, 0, 1, proxy);
            }
        }
    }    

    async spinWheel(authorization, proxy) {
        const url = `${this.baseURL}/wheel/spin`;
        const payload = {};
        const proxyAgent = new HttpsProxyAgent(proxy);
        
        try {
            const response = await axios.post(url, payload, { 
                headers: this.headers(authorization),
                httpsAgent: proxyAgent
            });
            const result = response.data.result;
            this.log(`Spin successful: received ${result.reward}`, 'success');
            this.log(`* Balance : ${result.balance}`);
            this.log(`* Toncoin : ${result.toncoin}`);
            this.log(`* Notcoin : ${result.notcoin}`);
            this.log(`* Tickets : ${result.tickets}`);
            return result;
        } catch (error) {
            this.log(`Spin error: ${error.message}`, 'error');
            throw error;
        }
    }

    async spinAllTickets(authorization, initialTickets, proxy) {
        let tickets = initialTickets;
        while (tickets > 0) {
            try {
                const result = await this.spinWheel(authorization, proxy);
                tickets = result.tickets;
            } catch (error) {
                this.log(`Spin error: ${error.message}`, 'error');
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.log('All tickets used.', 'warning');
    }    
    
    async main() {
        const dataFile = 'data.txt';
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (true) {
            for (let no = 0; no < data.length; no++) {
                const authorization = data[no];
                const proxy = this.proxies[no] || this.proxies[0]; 
                const firstName = this.extractFirstName(authorization);

                try {
                    let proxyIP = 'Unknown';
                    try {
                        proxyIP = await this.checkProxyIP(proxy);
                    } catch (error) {
                        this.log(`Cannot check proxy IP: ${error.message}`, 'warning');
                    }

                    console.log(`========== Account ${no + 1} | ${firstName} | ip: ${proxyIP} ==========`.green);
                    const userInfo = await this.getMe(authorization, proxy);
                    this.log(`Initial Balance: ${userInfo.result.balance.toString().white}`, 'success');
                    this.log(`Tickets: ${userInfo.result.tickets.toString().white}`, 'success');
                    
                    await this.processTasks(authorization, userInfo.result.tasks, proxy);

                    if (userInfo.result.tickets > 0) {
                        this.log('Starting spin wheel...', 'info');
                        await this.spinAllTickets(authorization, userInfo.result.tickets, proxy);
                    }
                } catch (error) {
                    this.log(`Error processing account ${no + 1}: ${error.message}`, 'error');
                }
            }

            await this.waitWithCountdown(1440 * 60);
        }
    }
}

if (require.main === module) {
    const agentAPI = new AgentAPI();
    agentAPI.main().catch(err => {
        agentAPI.log(err.message, 'error');
        process.exit(1);
    });
}