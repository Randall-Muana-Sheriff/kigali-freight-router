import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const AuthController = {
    // Register a new user account (Dispatcher, Driver, or Merchant)
    register: async (req, res) => {
        const { name, email, password, role } = req.body;
        try {
            // Hash the password with 10 salt rounds before storing it
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const query = `
                INSERT INTO users (name, email, password_hash, role)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name, email, role, created_at;
            `;
            const result = await pool.query(query, [name, email, hashedPassword, role]);
            return res.status(201).json({ message: "User account created successfully.", user: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') { // PostgreSQL unique violation error code
                return res.status(400).json({ error: "An account with this email already exists." });
            }
            return res.status(500).json({ error: error.message });
        }
    },

    // Verify user and issue a JWT token
    login: async (req, res) => {
        const { email, password } = req.body;
        try {
            const query = `SELECT * FROM users WHERE email = $1`;
            const result = await pool.query(query, [email]);
            
            if (result.rows.length === 0) {
                return res.status(401).json({ error: "Invalid email or password credentials." });
            }

            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password_hash);
            
            if (!isMatch) {
                return res.status(401).json({ error: "Invalid email or password credentials." });
            }

            // Create a token containing the user's ID, email, and role
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.status(200).json({
                message: "Login successful.",
                token,
                user: { id: user.id, name: user.name, role: user.role }
            });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
};