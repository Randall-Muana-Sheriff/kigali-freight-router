import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const ALLOWED_ROLES = ['admin', 'manager', 'dispatcher'];

export const AuthController = {
    // Register a new user account
    register: async (req, res) => {
        const { username, password, role } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        try {
            const assignedRole = role && ALLOWED_ROLES.includes(role) ? role : 'dispatcher';
            const hashedPassword = await bcrypt.hash(password, 10);

            const query = `
                INSERT INTO users (username, password_hash, role)
                VALUES ($1, $2, $3)
                RETURNING id, username, role;
            `;
            const result = await pool.query(query, [username, hashedPassword, assignedRole]);
            const newUser = result.rows[0];

            const token = jwt.sign(
                { username: newUser.username, role: newUser.role },
                process.env.JWT_SECRET,
                { expiresIn: '2h' }
            );

            return res.status(201).json({
                success: true,
                token,
                role: newUser.role,
                message: 'User registered successfully'
            });
        } catch (error) {
            if (error.code === '23505') { // PostgreSQL unique violation error code
                return res.status(400).json({ error: 'Username is already taken' });
            }
            return res.status(500).json({ error: error.message });
        }
    },

    // Verify user and issue a JWT token
    login: async (req, res) => {
        const { username, password } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }
        try {
            // Preserve the simulator bypass: sim_driver* accounts skip DB lookup entirely
            if (username.startsWith('sim_driver')) {
                const token = jwt.sign({ username, role: 'dispatcher' }, process.env.JWT_SECRET, { expiresIn: '2h' });
                return res.json({ token, role: 'dispatcher' });
            }

            const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password || '', user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const token = jwt.sign(
                { username: user.username, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '2h' }
            );

            return res.status(200).json({ token, role: user.role });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
};