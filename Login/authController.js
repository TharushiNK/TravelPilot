import db from './db.js';
import bcrypt from 'bcryptjs';



export const login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', {
            error: "Email and password are required",
            success: null,
            email
        });
    }

    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.render('login', {
                error: "Something went wrong. Try again.",
                success: null,
                email
            });
        }

        if (results.length === 0) {
            return res.render('login', {
                error: "Invalid credentials",
                success: null,
                email
            });
        }

        const user = results[0];

        if (user.status !== "ACTIVE") {
            return res.render('login', {
                error: "Account is blocked",
                success: null,
                email
            });
        }

        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) {
            return res.render('login', {
                error: "Invalid credentials",
                success: null,
                email
            });
        }
        
        // Save ALL user data to session
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || '', // Include phone
            role: user.role
        };

        // Redirect according to role
        switch (user.role.toUpperCase()) {
            case "HOTELIER":
                return res.redirect('/hotelier');
            case "ADMIN":
                return res.redirect('/admin');
            case "TOURIST":
                return res.redirect('/tourist');
            case "TOUR GUIDE":
                return res.redirect('/tour-guide');
            case "TRANSPORT PROVIDER":
                return res.redirect('/transport');
            default:
                return res.redirect('/firstpage');
        }
    });
};

export const logoutController = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Could not log out. Please try again.');
        }

        // Clear cookie (important)
        res.clearCookie('connect.sid');

        // Redirect to login or landing page
        res.redirect('/login');
    });
};


