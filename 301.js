const fs = require('fs');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');

class AgentAPI {
    constructor() {
        this.baseURL = 'https://api.agent301.org';
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
            this.log(`Could not read data: ${error.message}`, 'error');
            return 'Unknown';
        }
    }

    async getMe(authorization) {
        const url = `${this.baseURL}/getMe`;
        const payload = {"referrer_id": 376905749};
        
        try {
            const response = await axios.post(url, payload, { headers: this.headers(authorization) });
            return response.data;
        } catch (error) {
            this.log(`Error getting user information: ${error.message}`, 'error');
            throw error;
        }
    }

    async completeTask(authorization, taskType, taskTitle, currentCount = 0, maxCount = 1) {
        const url = `${this.baseURL}/completeTask`;
        const payload = { "type": taskType };
        
        try {
            const response = await axios.post(url, payload, { headers: this.headers(authorization) });
            const result = response.data.result;
            this.log(`Completed task ${taskTitle.yellow} ${currentCount + 1}/${maxCount} successfully | Reward ${result.reward.toString().magenta} | Balance ${result.balance.toString().magenta}`, 'custom');
            return result;
        } catch (error) {
            this.log(`Failed to complete task ${taskTitle}: ${error.message}`, 'error');
        }
    }

    async processTasks(authorization, tasks) {
        const unclaimedTasks = tasks.filter(task => !task.is_claimed && !['nomis2', 'boost', 'invite_3_friends'].includes(task.type));
        
        if (unclaimedTasks.length === 0) {
            this.log("No uncompleted tasks remaining.", 'warning');
            return;
        }
    
        for (const task of unclaimedTasks) {
            if (task.max_count) {
                const remainingCount = task.max_count - (task.count || 0);
                for (let i = 0; i < remainingCount; i++) {
                    await this.completeTask(authorization, task.type, task.title, i, remainingCount);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } else {
                await this.completeTask(authorization, task.type, task.title);
            }
        }
    }    

    async spinWheel(authorization) {
        const url = `${this.baseURL}/wheel/spin`;
        const payload = {};
        
        try {
            const response = await axios.post(url, payload, { headers: this.headers(authorization) });
            const result = response.data.result;
            this.log(`Spin successful: received ${result.reward}`, 'success');
            this.log(`* Balance : ${result.balance}`);
            this.log(`* Toncoin : ${result.toncoin}`);
            this.log(`* Notcoin : ${result.notcoin}`);
            this.log(`* Tickets : ${result.tickets}`);
            return result;
        } catch (error) {
            this.log(`Error during spin: ${error.message}`, 'error');
            throw error;
        }
    }

    async spinAllTickets(authorization, initialTickets) {
        let tickets = initialTickets;
        while (tickets > 0) {
            try {
                const result = await this.spinWheel(authorization);
                tickets = result.tickets;
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                this.log(`Stopped spinning due to error: ${error.message}`, 'error');
                break;
            }
        }
        this.log('All tickets used or an error occurred', 'warning');
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
                const firstName = this.extractFirstName(authorization);

                try {
                    console.log(`========== Account ${no + 1} | ${firstName} ==========`.green);
                    const userInfo = await this.getMe(authorization);
                    this.log(`Initial Balance: ${userInfo.result.balance.toString().white}`, 'success');
                    this.log(`Tickets: ${userInfo.result.tickets.toString().white}`, 'success');
                    
                    await this.processTasks(authorization, userInfo.result.tasks);

                    if (userInfo.result.tickets > 0) {
                        this.log('Starting wheel spin...', 'info');
                        await this.spinAllTickets(authorization, userInfo.result.tickets);
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