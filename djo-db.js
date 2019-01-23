const {DB_HOST, DB_PASS, DB_NAME, DB_USER} = require('./globals')
const {writeToLog} = require('./scrape')

async function connect() {
    const conn = require('mysql').createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME
    })
    return new Promise((resolve, reject) => {
        conn.connect((error) => {
            if (error) {
                reject(error)
            } else {
                resolve(conn)
            }
        })
    })
}
async function disconnect(conn) {
    return new Promise((resolve, reject) => {
        conn.end((error) => {
            if (error) {
                reject(error)
            } else {
                resolve()
            }
        })
    })
}

async function query(sql, params) {
    const conn = await connect()
    const ret = await new Promise(((resolve, reject) => {
        conn.query(sql, params, (error, results, fields) => {
            if (error) {
                reject(error)
            } else {
                resolve(results)
            }
        })
    }))
    await disconnect(conn)
    return ret
}

process.on('unhandledRejection', e => {
    console.error('Unhandled rejection', e)
    process.exit()
})

async function getPlayers() {
    const rows = await query(`
	SELECT
	    master.id AS djo_id,
        master.name AS djo_name,
	    bios.im_mwo AS mwo_name,
	    gameapis_mwo_players.mwo_name AS mwo_name_manual
	FROM
	    access
	    JOIN
		master
		ON access.player_id = master.id
	    LEFT JOIN bios
		ON master.id = bios.player_id
	    LEFT JOIN gameapis_mwo_players
		ON master.id = gameapis_mwo_players.djo_id
	WHERE
	    (bios.im_mwo != '' OR gameapis_mwo_players.mwo_name != '')
	    AND access.status = 'Active'
	GROUP BY
        master.id
    ORDER BY
        master.name
    `)
    rows.forEach(row => {
        if (row.mwo_name_manual) {
             row.mwomercs_name = row.mwo_name_manual
        } else {
             row.mwomercs_name = row.mwo_name
        }
    })
    return rows
}

/*
[
{
djo_id: number,
data: data from API
}
]
 */
async function saveStats(players) {
    writeToLog(`Test 2`)
    console.log(`Saving stats for ${players.map(p => `${p.djo_id} (${p.djo_name})`).join(',')}`)
    let sql = `
    INSERT INTO gameapis_mwo_mwomercs
    (djo_id, last_updated, data) VALUES
    `
    sql += players
        .map(player => `(${player.djo_id}, CURRENT_TIMESTAMP, ?)`)
        .join(',')

    sql += `
    ON DUPLICATE KEY UPDATE last_updated=VALUES(last_updated), data=VALUES(data)
    `
    await query(sql, players.map(player => JSON.stringify(player.data)))
}

module.exports = {
    getPlayers,
    saveStats
}
