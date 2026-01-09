import db from './db.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

//-----------all users

// Fetch all users (already existing)
export const getUsers = (req,res)=>{
    db.query("SELECT * FROM users",(err,results)=>{
        if(err){
            return res.status(500).json(err);
        }
        res.json(results);
    });
};

// Sign up new user
export const signUpController = (req, res) => {
    const { name, email, phone, password, role } = req.body

    // Validation
    if (!name || !email || !password || !role) {
        return res.render('signup', {
            error: 'Name, email, password, and role are required',
            success: null
        })
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10)

    // Insert user
    const sql = `
        INSERT INTO users (name, email, phone, password, role, status)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE')
    `
    const values = [
        name,
        email,
        phone || null,
        hashedPassword,
        role.toUpperCase()
    ]

    db.query(sql, values, (err, results) => {
        if (err) {
            // Duplicate email
            if (err.code === 'ER_DUP_ENTRY') {
                return res.render('signup', {
                    error: 'Email already exists',
                    success: null

                })
            }

            console.error(err)
            return res.render('signup', {
                error: 'Something went wrong. Please try again.',
                success: null
            })
        }

        res.render('signup', {
            success: 'Account created successfully!',
            error: null
        });
        
    })
}

//---------hotelier

//-----handling hotelier----
export const getHotelDetails = (req, res) => {
    const user = req.session.user;
    
    if (!user) {
        return res.redirect('/login');
    }
    
    if (user.role.toUpperCase() !== "HOTELIER") {
        return res.status(403).send("Access denied");
    }
    
    // Simple: Get hotels first
    const sql = "SELECT * FROM hotels WHERE user_id = ?";
    db.query(sql, [user.id], (err, hotels) => {
        if (err) {
            console.error("Error fetching hotels:", err);
            return res.status(500).send("Database error");
        }
        
        // For each hotel, get its room types
        const fetchRoomTypes = (index) => {
            if (index >= hotels.length) {
                // All room types fetched, render page
                res.render('hotelier', {
                    user: user,
                    hotels: hotels
                });
                return;
            }
            
            const hotel = hotels[index];
            const roomSql = "SELECT * FROM hotel_room_types WHERE hotel_id = ?";
            db.query(roomSql, [hotel.id], (roomErr, roomTypes) => {
                if (roomErr) {
                    console.error("Error fetching room types:", roomErr);
                    hotel.room_details = [];
                } else {
                    hotel.room_details = roomTypes;
                }
                
                // Fetch next hotel's room types
                fetchRoomTypes(index + 1);
            });
        };
        
        // Start fetching room types
        if (hotels.length > 0) {
            fetchRoomTypes(0);
        } else {
            // No hotels, just render
            res.render('hotelier', {
                user: user,
                hotels: []
            });
        }
    });
};

// Add new hotel (POST)
export const addHotelController = (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const {
        name,
        property_type,
        address_line1,
        address_line2,
        city,
        province,
        district,
        telephone,
        email,
        total_rooms,
        offers,
        payment_methods,
        // Room types data (arrays from form)
        room_type,
        room_price,
        room_max_adults,
        room_max_children,
        room_available
    } = req.body;

    // Handle uploaded images
    const photos = req.files && req.files.length > 0
        ? req.files.map(file => file.filename).join(',')
        : null;

    // Simple: Insert hotel first
    const hotelSql = `
        INSERT INTO hotels
        (user_id, name, property_type, address_line1, address_line2, city, province, district,
         telephone, email, total_rooms, offers, payment_methods, photos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(hotelSql, [
        user.id,
        name,
        property_type,
        address_line1,
        address_line2,
        city,
        province,
        district,
        telephone,
        email,
        total_rooms,
        offers || 0,
        payment_methods ? payment_methods.join(',') : null,
        photos
    ], (err, result) => {
        if (err) {
            console.error(err);
            return res.render('addHotel', {
                user,
                hotel: {},
                isEdit: false,
                error: 'Error saving hotel. Please try again.',
                success: null
            });
        }
        
        const hotelId = result.insertId;
        
        // Now insert room types if any
        if (room_type && Array.isArray(room_type) && room_type.length > 0) {
            const roomValues = [];
            
            for (let i = 0; i < room_type.length; i++) {
                roomValues.push([
                    hotelId,
                    room_type[i],
                    parseFloat(room_price[i]) || 0,
                    parseInt(room_max_adults[i]) || 2,
                    parseInt(room_max_children[i]) || 0,
                    parseInt(room_available[i]) || 0
                ]);
            }
            
            const roomSql = `
                INSERT INTO hotel_room_types 
                (hotel_id, room_type, price_per_night, max_adults, max_children, available_rooms)
                VALUES ?
            `;
            
            db.query(roomSql, [roomValues], (roomErr) => {
                if (roomErr) {
                    console.error(roomErr);
                    // Hotel created but room types failed - still redirect
                }
                res.redirect('/hotelier');
            });
        } else {
            res.redirect('/hotelier');
        }
    });
};

// Show edit hotel form
export const showEditHotelForm = (req, res) => {
    const user = req.session.user;
    const hotelId = req.params.id;

    if (!user) return res.redirect('/login');

    // Simple: Get hotel details
    const hotelSql = `SELECT * FROM hotels WHERE id = ? AND user_id = ?`;
    db.query(hotelSql, [hotelId, user.id], (err, hotelResults) => {
        if (err || hotelResults.length === 0) {
            return res.redirect('/hotelier');
        }

        const hotel = hotelResults[0];
        
        // Get room types for this hotel
        const roomSql = `SELECT * FROM hotel_room_types WHERE hotel_id = ?`;
        db.query(roomSql, [hotelId], (roomErr, roomResults) => {
            if (roomErr) {
                console.error(roomErr);
                hotel.room_details = [];
            } else {
                hotel.room_details = roomResults;
            }
            
            // Convert stored CSV strings to arrays for checkboxes
            hotel.payment_methods = hotel.payment_methods ? hotel.payment_methods.split(',') : [];
            
            res.render('addHotel', {
                user,
                hotel,
                isEdit: true,
                error: null,
                success: null
            });
        });
    });
};

// Update hotel (PUT)
export const updateHotelController = (req, res) => {
    const user = req.session.user;
    const hotelId = req.params.id;

    const {
        name,
        property_type,
        address_line1,
        address_line2,
        city,
        province,
        district,
        telephone,
        email,
        total_rooms,
        offers,
        payment_methods,
        // Room types data (arrays from form)
        room_type,
        room_price,
        room_max_adults,
        room_max_children,
        room_available
    } = req.body;

    // Get removed photos from the form
    const removedPhotos = req.body.removed_photos || [];
    const newPhotos = req.files && req.files.length > 0
        ? req.files.map(file => file.filename).join(',')
        : null;

    // First, get existing images
    db.query('SELECT photos FROM hotels WHERE id = ?', [hotelId], (err, results) => {
        if (err) {
            console.error(err);
            return res.redirect('/hotelier');
        }

        let existingPhotos = results[0]?.photos || '';
        
        // Filter out removed photos
        if (existingPhotos && removedPhotos.length > 0) {
            const existingArray = existingPhotos.split(',');
            const filteredArray = existingArray.filter(photo => 
                !removedPhotos.includes(photo)
            );
            existingPhotos = filteredArray.join(',');
        }

        // Combine with new photos
        const combinedPhotos = newPhotos
            ? (existingPhotos ? existingPhotos + ',' + newPhotos : newPhotos)
            : existingPhotos;

        // Delete removed files from filesystem
        if (removedPhotos.length > 0) {
            removedPhotos.forEach(photo => {
                const filePath = path.join(process.cwd(), 'public', 'uploads', photo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        // Update hotel info
        const updateHotelSql = `
            UPDATE hotels SET
            name = ?, property_type = ?, address_line1 = ?, address_line2 = ?, city = ?, province = ?, district = ?,
            telephone = ?, email = ?, total_rooms = ?, offers = ?, payment_methods = ?, photos = ?
            WHERE id = ? AND user_id = ?
        `;

        db.query(updateHotelSql, [
            name,
            property_type,
            address_line1,
            address_line2,
            city,
            province,
            district,
            telephone,
            email,
            total_rooms,
            offers || 0,
            payment_methods ? payment_methods.join(',') : null,
            combinedPhotos,
            hotelId,
            user.id
        ], (updateErr) => {
            if (updateErr) {
                console.error(updateErr);
                return res.render('addHotel', {
                    user,
                    hotel: {},
                    isEdit: true,
                    error: 'Error updating hotel. Please try again.',
                    success: null
                });
            }

            // Delete old room types
            db.query('DELETE FROM hotel_room_types WHERE hotel_id = ?', [hotelId], (deleteErr) => {
                if (deleteErr) {
                    console.error(deleteErr);
                    // Hotel updated but room types delete failed - still redirect
                    return res.redirect('/hotelier');
                }

                // Insert new room types if any
                if (room_type && Array.isArray(room_type) && room_type.length > 0) {
                    const roomValues = [];
                    
                    for (let i = 0; i < room_type.length; i++) {
                        roomValues.push([
                            hotelId,
                            room_type[i],
                            parseFloat(room_price[i]) || 0,
                            parseInt(room_max_adults[i]) || 2,
                            parseInt(room_max_children[i]) || 0,
                            parseInt(room_available[i]) || 0
                        ]);
                    }
                    
                    const roomSql = `
                        INSERT INTO hotel_room_types 
                        (hotel_id, room_type, price_per_night, max_adults, max_children, available_rooms)
                        VALUES ?
                    `;
                    
                    db.query(roomSql, [roomValues], (roomInsertErr) => {
                        if (roomInsertErr) {
                            console.error(roomInsertErr);
                            // Hotel updated but room types insert failed
                        }
                        res.redirect('/hotelier');
                    });
                } else {
                    res.redirect('/hotelier');
                }
            });
        });
    });
};

// Get ALL hotels for tourist listing (public access)
export const getAllHotelsForTourist = (req, res) => {
    const sql = `
        SELECT 
            h.id,
            h.name,
            h.address_line1 AS address,
            h.district,
            h.city,
            h.province,
            h.photos,
            h.telephone,
            h.email,
            h.offers,
            h.property_type,
            h.total_rooms,
            h.payment_methods,
            MIN(r.price_per_night) as min_price,
            MAX(r.price_per_night) as max_price,
            GROUP_CONCAT(DISTINCT r.room_type) as room_types,
            SUM(r.available_rooms) as total_available_rooms
        FROM hotels h
        LEFT JOIN hotel_room_types r ON h.id = r.hotel_id
        GROUP BY h.id, h.name, h.address_line1, h.district, h.city, h.province,
                 h.photos, h.telephone, h.email, h.offers,
                 h.property_type, h.total_rooms, h.payment_methods
        ORDER BY h.name ASC
    `;

    db.query(sql, (err, hotels) => {
        if (err) {
            console.error("Error fetching hotels:", err);
            return res.status(500).send("Database error");
        }

        // Process hotels to get room details
        const fetchRoomDetails = (index) => {
            if (index >= hotels.length) {
                // All hotels processed, render page
                res.render('hotels', {
                    hotels: hotels,
                    user: req.session.user || null
                });
                return;
            }

            const hotel = hotels[index];
            
            // Convert photos string to array
            if (hotel.photos) {
                hotel.photosArray = hotel.photos.split(',').map(photo => 
                    `/uploads/${photo.trim()}`
                );
            } else {
                hotel.photosArray = ['/images/default-hotel.jpg'];
            }
            
            // Parse room types string to array
            if (hotel.room_types) {
                hotel.roomTypes = hotel.room_types.split(',');
            } else {
                hotel.roomTypes = [];
            }
            
            // Get room details for this hotel
            const roomSql = `
                SELECT 
                    id,
                    room_type,
                    price_per_night,
                    max_adults,
                    max_children,
                    available_rooms
                FROM hotel_room_types 
                WHERE hotel_id = ?
                ORDER BY price_per_night ASC
            `;
            
            db.query(roomSql, [hotel.id], (roomErr, rooms) => {
                if (roomErr) {
                    console.error("Error fetching room details:", roomErr);
                    hotel.rooms = [];
                } else {
                    hotel.rooms = rooms;
                }
                
                // Add a placeholder rating based on offers (you can remove or customize this)
                hotel.rating = hotel.offers > 0 ? 4.0 : 3.5;
                
                // Continue to next hotel
                fetchRoomDetails(index + 1);
            });
        };

        // Start processing hotels
        if (hotels.length > 0) {
            fetchRoomDetails(0);
        } else {
            // No hotels, just render
            res.render('hotels', {
                hotels: [],
                user: req.session.user || null
            });
        }
    });
};

// Get hotel details by ID
export const getHotelDetailsById = (req, res) => {
    const hotelId = req.params.id;

    const sql = `
        SELECT 
            h.id,
            h.name,
            h.address_line1 AS address,
            h.address_line2,
            h.district,
            h.city,
            h.province,
            h.photos,
            h.telephone,
            h.email,
            h.offers,
            h.property_type,
            h.total_rooms,
            h.payment_methods,
            r.id AS room_id,
            r.room_type,
            r.price_per_night,
            r.max_adults,
            r.max_children,
            r.available_rooms
        FROM hotels h
        LEFT JOIN hotel_room_types r ON h.id = r.hotel_id
        WHERE h.id = ?
    `;

    db.query(sql, [hotelId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }

        if (results.length === 0) {
            return res.status(404).send("Hotel not found");
        }

        // Create hotel object
        const hotel = {
            id: results[0].id,
            name: results[0].name,
            address: results[0].address,
            address_line2: results[0].address_line2,
            district: results[0].district,
            city: results[0].city,
            province: results[0].province,
            telephone: results[0].telephone,
            email: results[0].email,
            offers: results[0].offers,
            property_type: results[0].property_type,
            total_rooms: results[0].total_rooms,
            payment_methods: results[0].payment_methods,
            rooms: []
        };

        // Process photos
        if (results[0].photos) {
            hotel.photosArray = results[0].photos.split(',').map(photo => 
                `/uploads/${photo.trim()}`
            );
        } else {
            hotel.photosArray = ['/images/default-hotel.jpg'];
        }

        // Add placeholder rating
        hotel.rating = results[0].offers > 0 ? 4.0 : 3.5;
        
        // Get min price
        const prices = results.filter(r => r.price_per_night).map(r => r.price_per_night);
        hotel.min_price = prices.length > 0 ? Math.min(...prices) : 0;

        // Push room types
        results.forEach(row => {
            if (row.room_id) {
                hotel.rooms.push({
                    id: row.room_id,
                    room_type: row.room_type,
                    price_per_night: row.price_per_night,
                    max_adults: row.max_adults,
                    max_children: row.max_children,
                    available_rooms: row.available_rooms
                });
            }
        });

        // Get room types for filtering
        hotel.roomTypes = hotel.rooms.map(room => room.room_type);

        res.render("hotels", { 
            hotels: [hotel], // Wrap in array for consistency
            hotel: hotel 
        });
    });
};

//handle hotel bookings----------

// Add booking controller
export const createBookingController = (req, res) => {
    const user = req.session.user;
    
    if (!user) {
        return res.status(401).json({ 
            success: false, 
            message: 'Please login to book a hotel' 
        });
    }
    
    const {
        hotel_id,
        guest_name,
        guest_email,
        guest_contact,
        room_type,
        no_of_rooms,
        checkin_date,
        checkout_date,
        discounted_amount,
        total_amount,
        room_price
    } = req.body;
    
    console.log('Booking request received from user:', user.id);
    console.log('Booking data:', req.body);
    
    // Validation
    if (!hotel_id || !room_type || !no_of_rooms || !checkin_date || !checkout_date) {
        return res.status(400).json({
            success: false,
            message: 'Please fill all required fields'
        });
    }
    
    // Calculate number of nights
    const checkIn = new Date(checkin_date);
    const checkOut = new Date(checkout_date);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Check-out date must be after check-in date'
        });
    }
    
    // Start transaction manually with SQL queries
    const startTransaction = () => {
        return new Promise((resolve, reject) => {
            db.query('START TRANSACTION', (err) => {
                if (err) {
                    console.error('Start transaction error:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    };
    
    const commitTransaction = () => {
        return new Promise((resolve, reject) => {
            db.query('COMMIT', (err) => {
                if (err) {
                    console.error('Commit error:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    };
    
    const rollbackTransaction = () => {
        return new Promise((resolve) => {
            db.query('ROLLBACK', (err) => {
                if (err) {
                    console.error('Rollback error:', err);
                }
                resolve();
            });
        });
    };
    
    // Main booking process
    const processBooking = async () => {
        try {
            // Start transaction
            await startTransaction();
            
            // Step 1: Check room availability
            const checkAvailabilitySql = `
                SELECT id, available_rooms 
                FROM hotel_room_types 
                WHERE hotel_id = ? 
                AND room_type = ?
            `;
            
            const availabilityResults = await new Promise((resolve, reject) => {
                db.query(checkAvailabilitySql, [hotel_id, room_type], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });
            
            if (availabilityResults.length === 0) {
                await rollbackTransaction();
                return {
                    success: false,
                    message: 'Selected room type not found.'
                };
            }
            
            const roomTypeId = availabilityResults[0].id;
            const currentAvailableRooms = availabilityResults[0].available_rooms;
            
            // Validate if enough rooms are available
            if (currentAvailableRooms < parseInt(no_of_rooms)) {
                await rollbackTransaction();
                return {
                    success: false,
                    message: `Only ${currentAvailableRooms} rooms available for selected type.`
                };
            }
            
            // Step 2: Update available rooms count
            const newAvailableRooms = currentAvailableRooms - parseInt(no_of_rooms);
            const updateRoomSql = `
                UPDATE hotel_room_types 
                SET available_rooms = ? 
                WHERE id = ? AND hotel_id = ?
            `;
            
            await new Promise((resolve, reject) => {
                db.query(updateRoomSql, [newAvailableRooms, roomTypeId, hotel_id], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            // Step 3: Insert booking record
            const insertBookingSql = `
                INSERT INTO hotel_bookings 
                (user_id, hotel_id, guest_name, guest_email, guest_contact, 
                 room_type, no_of_rooms, checkin_date, checkout_date, 
                 discounted_amount, total_amount, booking_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const bookingValues = [
                user.id,
                hotel_id,
                guest_name || user.name,
                guest_email || user.email,
                guest_contact || user.phone || '',
                room_type,
                parseInt(no_of_rooms),
                checkin_date,
                checkout_date,
                parseFloat(discounted_amount) || 0,
                parseFloat(total_amount),
                0  // booking_status: 0 = pending
            ];
            
            const bookingResults = await new Promise((resolve, reject) => {
                db.query(insertBookingSql, bookingValues, (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });
            
            // Step 4: Commit transaction
            await commitTransaction();
            
            // Success!
            return {
                success: true,
                message: 'Booking request submitted successfully!',
                bookingId: bookingResults.insertId,
                bookingDetails: {
                    hotelId: hotel_id,
                    roomType: room_type,
                    roomsBooked: parseInt(no_of_rooms),
                    checkIn: checkin_date,
                    checkOut: checkout_date,
                    totalAmount: total_amount,
                    availableRooms: newAvailableRooms
                }
            };
            
        } catch (error) {
            // Rollback on any error
            await rollbackTransaction();
            console.error('Booking process error:', error);
            throw error;
        }
    };
    
    // Execute booking process
    processBooking()
        .then(result => {
            res.json(result);
        })
        .catch(error => {
            console.error('Booking controller error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error. Please try again.'
            });
        });
};

//Add function to check date conflicts
export const checkRoomAvailability = (req, res) => {
    const { hotel_id, room_type, checkin_date, checkout_date } = req.query;
    
    if (!hotel_id || !room_type) {
        return res.status(400).json({
            success: false,
            message: 'Hotel ID and room type are required'
        });
    }
    
    // Check for overlapping bookings
    const checkOverlapSql = `
        SELECT COALESCE(SUM(no_of_rooms), 0) as booked_rooms
        FROM hotel_bookings 
        WHERE hotel_id = ? 
        AND room_type = ?
        AND booking_status IN (0, 1) -- pending or confirmed
        AND (
            (checkin_date < ? AND checkout_date > ?) OR
            (checkin_date >= ? AND checkin_date < ?) OR
            (checkout_date > ? AND checkout_date <= ?)
        )
    `;
    
    // Get total available rooms
    const getTotalRoomsSql = `
        SELECT available_rooms 
        FROM hotel_room_types 
        WHERE hotel_id = ? 
        AND room_type = ?
    `;
    
    db.query(getTotalRoomsSql, [hotel_id, room_type], (err, roomResults) => {
        if (err || roomResults.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Room type not found'
            });
        }
        
        const totalRooms = roomResults[0].available_rooms;
        
        // If dates provided, check for overlaps
        if (checkin_date && checkout_date) {
            db.query(checkOverlapSql, [
                hotel_id, room_type,
                checkout_date, checkin_date,
                checkin_date, checkout_date,
                checkin_date, checkout_date
            ], (err, overlapResults) => {
                if (err) {
                    console.error('Overlap check error:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Error checking availability'
                    });
                }
                
                const bookedRooms = overlapResults[0].booked_rooms;
                const available = totalRooms - bookedRooms;
                
                res.json({
                    success: true,
                    available: available,
                    total: totalRooms,
                    booked: bookedRooms,
                    isAvailable: available > 0
                });
            });
        } else {
            // Just return current availability
            res.json({
                success: true,
                available: totalRooms,
                total: totalRooms,
                booked: 0,
                isAvailable: totalRooms > 0
            });
        }
    });
};

// Get bookings for hotels of the logged-in hotelier
export const getHotelBookingsByHotelId = (req, res) => {
    const user = req.session.user;

    if (!user) return res.redirect('/login');
    if (user.role.toUpperCase() !== "HOTELIER") return res.status(403).send("Access denied");

    const hotelId = req.params.hotelId;

    if (!hotelId) return res.status(400).send("Hotel ID is required");

    // Step 1: Verify the hotel belongs to the logged-in hotelier
    const hotelCheckSql = "SELECT id, name FROM hotels WHERE id = ? AND user_id = ?";
    db.query(hotelCheckSql, [hotelId, user.id], (err, hotels) => {
        if (err) {
            console.error("Error fetching hotel:", err);
            return res.status(500).send("Database error");
        }
        if (hotels.length === 0) {
            return res.status(404).send("Hotel not found or access denied");
        }

        const hotel = hotels[0];

        // Step 2: Fetch bookings for this hotel
        const bookingSql = `
            SELECT 
                b.id,
                b.user_id,
                b.guest_name,
                b.guest_email,
                b.guest_contact,
                b.room_type,
                b.no_of_rooms,
                b.checkin_date,
                b.checkout_date,
                b.discounted_amount,
                b.total_amount,
                b.booking_status,
                b.created_at,
                h.name as hotel_name,
                u.name as user_name,
                u.email as user_email
            FROM hotel_bookings b
            LEFT JOIN hotels h ON b.hotel_id = h.id
            LEFT JOIN users u ON b.user_id = u.id
            WHERE b.hotel_id = ?
            ORDER BY 
                CASE 
                    WHEN b.booking_status = 0 THEN 1  -- Pending first
                    WHEN b.booking_status = 1 THEN 2  -- Confirmed second
                    ELSE 3  -- Cancelled/other last
                END,
                b.created_at DESC
        `;

        db.query(bookingSql, [hotelId], (bookingErr, bookings) => {
            if (bookingErr) {
                console.error("Error fetching bookings:", bookingErr);
                return res.status(500).send("Database error");
            }

            // Calculate booking duration and format dates
            bookings.forEach(booking => {
                // Calculate number of nights
                const checkIn = new Date(booking.checkin_date);
                const checkOut = new Date(booking.checkout_date);
                booking.nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                
                // Format dates
                booking.checkin_formatted = checkIn.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                booking.checkout_formatted = checkOut.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                
                // Status mapping and styling
                const statusMap = {
                    0: { text: "Pending", class: "status-pending", icon: "fas fa-clock" },
                    1: { text: "Confirmed", class: "status-confirmed", icon: "fas fa-check-circle" },
                    2: { text: "Cancelled", class: "status-cancelled", icon: "fas fa-times-circle" }
                };
                
                booking.status_info = statusMap[booking.booking_status] || { text: "Unknown", class: "status-unknown", icon: "fas fa-question-circle" };
                
                // Created at formatted
                const created = new Date(booking.created_at);
                booking.created_formatted = created.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            });

            res.render("hotelierBookings", {
                user,
                hotel,
                bookings,
                hotelId
            });
        });
    });
};

//updating booking status
export const updateBookingStatus = async (req, res) => {
    const user = req.session.user;
    if (!user || user.role.toUpperCase() !== "HOTELIER") {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const bookingId = req.params.bookingId;
    const { status } = req.body;

    if (![0, 1, 2].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    try {
        // First, verify that the booking belongs to one of the hotelier's hotels
        const verifySql = `
            SELECT b.id 
            FROM hotel_bookings b
            JOIN hotels h ON b.hotel_id = h.id
            WHERE b.id = ? AND h.user_id = ?
        `;

        db.query(verifySql, [bookingId, user.id], (err, results) => {
            if (err) {
                console.error('Verification error:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (results.length === 0) {
                return res.status(404).json({ success: false, message: 'Booking not found or unauthorized' });
            }

            // Update the booking status
            const updateSql = 'UPDATE hotel_bookings SET booking_status = ? WHERE id = ?';
            db.query(updateSql, [status, bookingId], (updateErr) => {
                if (updateErr) {
                    console.error('Update error:', updateErr);
                    return res.status(500).json({ success: false, message: 'Failed to update status' });
                }

                const statusText = status === 1 ? 'confirmed' : status === 2 ? 'rejected' : 'pending';
                res.json({
                    success: true,
                    message: `Booking has been ${statusText} successfully`
                });
            });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

//----------tour guide

//get tour guide details
export const getTourGuideDetails = (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    if (user.role.toUpperCase() !== "TOUR GUIDE") {
        return res.status(403).send("Access denied");
    }

    const sql = "SELECT * FROM tour_guides WHERE user_id = ?";
    db.query(sql, [user.id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }

        res.render('tourGuide', {
            user,
            guides: results
        });
    });
};

//add tour guide
export const addTourGuideController = (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const {
        name,
        email,
        telephone,
        address_line1,
        address_line2,
        city,
        district,
        province,
        languages,
        experience_years,
        price_per_day,
        payment_methods,
        availability,
        offers
    } = req.body;

    const photos = req.files?.length
        ? req.files.map(f => f.filename).join(',')
        : null;

    const sql = `
        INSERT INTO tour_guides
        (user_id, name, email, telephone, address_line1, address_line2, city, district, province,
        languages, experience_years, price_per_day, payment_methods,availabilty, offers, photos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
    `;

    db.query(sql, [
        user.id,
        name,
        email,
        telephone,
        address_line1,
        address_line2,
        city,
        district,
        province,
        languages ? languages.join(',') : null,
        experience_years,
        price_per_day,
        payment_methods ? payment_methods.join(',') : null,
        availability || 1,
        offers || 0,
        photos
    ], (err) => {
        if (err) {
            console.error(err);
            return res.render('addTourGuide', {
                user,
                guide: {},
                isEdit: false,
                error: "Error saving tour guide",
                success: null
            });
        }
        res.redirect('/tour-guide');
    });
};

//show edit form
export const showEditTourGuideForm = (req, res) => {
    const user = req.session.user;
    const id = req.params.id;

    if (!user) return res.redirect('/login');

    db.query(
        "SELECT * FROM tour_guides WHERE id = ? AND user_id = ?",
        [id, user.id],
        (err, results) => {
            if (err || results.length === 0) return res.redirect('/tour-guide');

            const guide = results[0];
            guide.languages = guide.languages ? guide.languages.split(',') : [];
            guide.payment_methods = guide.payment_methods ? guide.payment_methods.split(',') : [];

            res.render('addTourGuide', {
                user,
                guide,
                isEdit: true,
                error: null,
                success: null
            });
        }
    );
};

//update tour guide
export const updateTourGuideController = (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const id = req.params.id;
    const {
        name,
        email,
        telephone,
        address_line1,
        address_line2,
        city,
        district,
        province,
        languages,
        experience_years,
        price_per_day,
        payment_methods,
        offers
    } = req.body;

    const removedPhotos = req.body.removed_photos || [];
    const newPhotos = req.files?.length
        ? req.files.map(f => f.filename).join(',')
        : null;

    // Get existing photos
    db.query("SELECT photos FROM tour_guides WHERE id = ?", [id], (err, result) => {
        if (err) return res.redirect('/tour-guide');

        let existingPhotos = result[0]?.photos || '';
        
        // Filter out removed photos
        if (existingPhotos && removedPhotos.length > 0) {
            const existingArray = existingPhotos.split(',');
            const filteredArray = existingArray.filter(photo => 
                !removedPhotos.includes(photo)
            );
            existingPhotos = filteredArray.join(',');
        }

        // Combine with new photos
        const combinedPhotos = newPhotos
            ? (existingPhotos ? existingPhotos + ',' + newPhotos : newPhotos)
            : existingPhotos;

        // Delete the actual files from filesystem
        if (removedPhotos.length > 0) {
            removedPhotos.forEach(photo => {
                const filePath = path.join(process.cwd(), 'public', 'uploads', photo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        const sql = `
            UPDATE tour_guides SET
            name=?, email=?, telephone=?, address_line1=?, address_line2=?, city=?, district=?, province=?,
            languages=?, experience_years=?, price_per_day=?, payment_methods=?, offers=?, photos=?
            WHERE id=? AND user_id=?
        `;

        db.query(sql, [
            name,
            email,
            telephone,
            address_line1,
            address_line2,
            city,
            district,
            province,
            languages ? languages.join(',') : null,
            experience_years,
            price_per_day,
            payment_methods ? payment_methods.join(',') : null,
            offers || 0,
            combinedPhotos,
            id,
            user.id
        ], () => res.redirect('/tour-guide'));
    });
};

// Get ALL tour guides for tourist listing
export const getAllGuidesForTourist = (req, res) => {
    const sql = `
        SELECT 
            id,
            name,
            email,
            address_line1,
            address_line2,
            city,
            district,
            province,
            telephone,
            languages,
            experience_years,
            availability,
            price_per_day,
            payment_methods,
            offers,
            photos
        FROM tour_guides
        ORDER BY name ASC
    `;

    db.query(sql, (err, guides) => {
        if (err) {
            console.error("Error fetching guides:", err);
            return res.status(500).send("Database error");
        }

        guides.forEach(guide => {
            // Convert languages string to array
            guide.languagesArray = guide.languages ? guide.languages.split(',').map(lang => lang.trim()) : [];

            // Convert photos to array
            guide.photosArray = guide.photos 
                ? guide.photos.split(',').map(photo => `/uploads/${photo.trim()}`) 
                : ['/images/default-guide.jpg'];

            // Placeholder rating based on offers
            guide.offerPercentage = guide.offers || 0;
            guide.rating = guide.offers && guide.offers > 0 ? 4.0 : 3.5;
        });

        res.render('guideBooking', {
            guides: guides,
            user: req.session.user || null
        });
    });
};

// Get guide details by ID
export const getGuideDetailsById = (req, res) => {
    const guideId = req.params.id;

    const sql = `
        SELECT 
            id,
            name,
            email,
            address_line1,
            address_line2,
            city,
            district,
            province,
            telephone,
            languages,
            experience_years,
            availability,
            price_per_day,
            payment_methods,
            offers,
            photos
        FROM tour_guides
        WHERE id = ?
    `;

    db.query(sql, [guideId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }

        if (results.length === 0) {
            return res.status(404).send("Guide not found");
        }

        const guide = results[0];
        guide.languagesArray = guide.languages ? guide.languages.split(',').map(lang => lang.trim()) : [];
        guide.photosArray = guide.photos 
            ? guide.photos.split(',').map(photo => `/uploads/${photo.trim()}`) 
            : ['/images/default-guide.jpg'];
        guide.offerPercentage = guide.offers || 0;
        guide.rating = guide.offers && guide.offers > 0 ? 4.0 : 3.5;

        res.render('guideBooking', {
            guides: [guide],
            guide: guide,
            user: req.session.user || null
        });
    });
};

// Handle guide booking--------

//create guide booking
export const createGuideBookingController = (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.status(401).json({ success: false, message: 'Please login to book a guide' });
    }

    const { guide_id, booking_date, no_of_days, total_amount } = req.body;

    if (!guide_id || !booking_date || !no_of_days || !total_amount) {
        return res.status(400).json({ success: false, message: 'Please fill all required fields' });
    }

    const insertSql = `
        INSERT INTO tour_guide_bookings
        (user_id, guide_id, booking_date, no_of_days, total_amount, booking_status)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
        user.id,
        guide_id,
        booking_date,
        parseInt(no_of_days),
        parseFloat(total_amount),
        0 // booking_status: 0 = pending
    ];

    db.query(insertSql, values, (err, result) => {
        if (err) {
            console.error('Booking error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({
            success: true,
            message: 'Guide booked successfully!',
            bookingId: result.insertId
        });
    });
};
// Get tour guide bookings by guide ID
export const getTourGuideBookingsByGuideId = (req, res) => {
    const user = req.session.user;

    // 🔐 Login check
    if (!user) return res.redirect('/login');

    // 🔐 Role check
    if (user.role.toUpperCase() !== "TOUR GUIDE") {
        return res.status(403).send("Access denied");
    }

    const guideId = req.params.guideId;
    if (!guideId) {
        return res.status(400).send("Guide ID is required");
    }

    // 🔎 Make sure this guide belongs to the logged-in user
    const guideSql = `
        SELECT id, name, email, price_per_day
        FROM tour_guides
        WHERE id = ? AND user_id = ?
    `;

    db.query(guideSql, [guideId, user.id], (err, guideRows) => {
        if (err) {
            console.error("Guide fetch error:", err);
            return res.status(500).send("Database error");
        }

        if (guideRows.length === 0) {
            return res.status(404).send("Tour guide not found");
        }

        const guide = guideRows[0];

        // 📅 Get bookings for THIS tour guide only
        const bookingSql = `
            SELECT 
                tgb.*,
                u.name AS guest_name,
                u.email AS guest_email,
                u.phone AS guest_contact
            FROM tour_guide_bookings tgb
            LEFT JOIN users u ON tgb.user_id = u.id
            WHERE tgb.guide_id = ?
            ORDER BY tgb.created_at DESC
        `;

        db.query(bookingSql, [guideId], (err, bookings) => {
            if (err) {
                console.error("Booking fetch error:", err);
                return res.status(500).send("Database error");
            }

            // 🧮 Format booking data
            bookings.forEach(b => {
                const bookingDate = new Date(b.booking_date);
                
                b.booking_formatted = bookingDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                // Calculate end date
                const endDate = new Date(bookingDate);
                endDate.setDate(endDate.getDate() + parseInt(b.no_of_days));
                
                b.end_formatted = endDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                const statusMap = {
                    0: { text: "Pending", class: "status-pending", icon: "fas fa-clock" },
                    1: { text: "Confirmed", class: "status-confirmed", icon: "fas fa-check-circle" },
                    2: { text: "Cancelled", class: "status-cancelled", icon: "fas fa-times-circle" }
                };

                b.status_info = statusMap[b.booking_status] || statusMap[0];
                
                // Calculate total amount if not already calculated
                if (!b.total_amount && guide.price_per_day) {
                    b.total_amount = parseFloat(guide.price_per_day) * parseInt(b.no_of_days);
                }
                
                // Format created at
                const created = new Date(b.created_at);
                b.created_formatted = created.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            });

            // 📊 Calculate stats
            let totalRevenue = 0;
            bookings.forEach(b => {
                if (b.booking_status === 1 && b.total_amount) { // confirmed only
                    totalRevenue += parseFloat(b.total_amount);
                }
            });

            const stats = {
                pending: bookings.filter(b => b.booking_status === 0).length,
                confirmed: bookings.filter(b => b.booking_status === 1).length,
                total: bookings.length,
                revenue: totalRevenue
            };

            // 🎨 Render page
            res.render("viewTourGuideBookings", {
                user,
                guide,
                bookings,
                stats,
                guideId
            });
        });
    });
};

// Update tour guide booking status
export const updateTourGuideBookingStatus = (req, res) => {
    const user = req.session.user;

    if (!user || user.role.toUpperCase() !== "TOUR GUIDE") {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const bookingId = req.params.bookingId;
    const { status } = req.body;

    if (![0, 1, 2].includes(Number(status))) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Verify booking belongs to guide
    const verifySql = `
        SELECT tgb.guide_id
        FROM tour_guide_bookings tgb
        JOIN tour_guides tg ON tgb.guide_id = tg.id
        WHERE tgb.id = ? AND tg.user_id = ?
    `;

    db.query(verifySql, [bookingId, user.id], (err, results) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found or unauthorized' });
        }

        const guideId = results[0].guide_id;

        // Update booking status
        const updateSql = `
            UPDATE tour_guide_bookings
            SET booking_status = ?
            WHERE id = ?
        `;

        db.query(updateSql, [status, bookingId], (updateErr, updateResult) => {
            if (updateErr) {
                console.error("Update error:", updateErr);
                return res.status(500).json({ success: false, message: 'Failed to update booking' });
            }

            // If confirmed → mark guide as unavailable
            if (Number(status) === 1) {
                db.query(
                    `UPDATE tour_guides SET availability = 0 WHERE id = ?`,
                    [guideId]
                );
            }
            
            // If cancelled and was previously confirmed → mark guide as available again
            if (Number(status) === 2) {
                // Check if it was previously confirmed
                const checkSql = `SELECT booking_status FROM tour_guide_bookings WHERE id = ?`;
                db.query(checkSql, [bookingId], (checkErr, checkResults) => {
                    if (!checkErr && checkResults.length > 0 && checkResults[0].booking_status === 1) {
                        db.query(
                            `UPDATE tour_guides SET availability = 1 WHERE id = ?`,
                            [guideId]
                        );
                    }
                });
            }

            const statusText =
                status == 1 ? 'confirmed' :
                status == 2 ? 'cancelled' :
                'pending';

            res.json({
                success: true,
                message: `Booking has been ${statusText} successfully`,
                guideId: guideId
            });
        });
    });
};

//----------------transport providers

// Get transport provider details along with their vehicles
export const getTransportDetails = (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    if (user.role.toUpperCase() !== "TRANSPORT PROVIDER") {
        return res.status(403).send("Access denied");
    }

    const sql = `
        SELECT tp.*, 
               v.id AS vehicle_id, v.vehicle_type, v.max_passengers, 
               v.price_per_km, v.availability
        FROM transport_providers tp
        LEFT JOIN transport_provider_vehicles v
        ON tp.id = v.transport_provider_id
        WHERE tp.user_id = ?
    `;

    db.query(sql, [user.id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }

        // Group vehicles under each transport provider
        const providersMap = {};
        results.forEach(row => {
            if (!providersMap[row.id]) {
                providersMap[row.id] = {
                    ...row,
                    vehicles: []
                };
            }
            if (row.vehicle_id) {
                providersMap[row.id].vehicles.push({
                    id: row.vehicle_id,
                    vehicle_type: row.vehicle_type,
                    max_passengers: row.max_passengers,
                    price_per_km: row.price_per_km,
                    availability: row.availability
                });
            }
        });

        const transports = Object.values(providersMap);

        res.render('transportProvider', {
            user,
            transports
        });
    });
};

// Add new transport provider (with optional photos)
export const addTransportController = (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const {
        name,
        email,
        telephone,
        address_line1,
        address_line2,
        city,
        district,
        province,
        experience_years,
        payment_methods,
        offers,
        vehicles
    } = req.body;

    const photos = req.files?.length
        ? req.files.map(f => f.filename).join(',')
        : null;

    const sql = `
        INSERT INTO transport_providers
        (user_id, name, email, telephone, address_line1, address_line2, city, district, province,
         experience_years, payment_methods, offers, photos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        user.id,
        name,
        email,
        telephone,
        address_line1,
        address_line2,
        city,
        district,
        province,
        experience_years,
        payment_methods ? payment_methods.join(',') : null,
        offers || 0,
        photos
    ], (err, result) => {
        if (err) {
            console.error(err);
            return res.render('addTransport', {
                user,
                isEdit: false,
                error: "Error saving transport provider",
                success: null
            });
        }

        const providerId = result.insertId;

        // Parse vehicle data
        let vehicleData = [];
        
        if (vehicles) {
            // Check if vehicles is an array or object
            if (Array.isArray(vehicles)) {
                vehicles.forEach((vehicle, index) => {
                    if (vehicle && vehicle.vehicle_type) {
                        vehicleData.push({
                            vehicle_type: vehicle.vehicle_type,
                            max_passengers: parseInt(vehicle.max_passengers) || 4,
                            price_per_km: parseFloat(vehicle.price_per_km) || 100,
                            availability: vehicle.availability === '1' ? 1 : 0
                        });
                    }
                });
            } else if (typeof vehicles === 'object') {
                // Handle single vehicle case
                if (vehicles.vehicle_type) {
                    vehicleData.push({
                        vehicle_type: vehicles.vehicle_type,
                        max_passengers: parseInt(vehicles.max_passengers) || 4,
                        price_per_km: parseFloat(vehicles.price_per_km) || 100,
                        availability: vehicles.availability === '1' ? 1 : 0
                    });
                }
            }
        }

        // Insert vehicles if any
        if (vehicleData.length > 0) {
            const vehicleValues = vehicleData.map(v => [
                providerId, 
                v.vehicle_type, 
                v.max_passengers,
                v.price_per_km,
                v.availability
            ]);

            db.query(
                'INSERT INTO transport_provider_vehicles (transport_provider_id, vehicle_type, max_passengers, price_per_km, availability) VALUES ?',
                [vehicleValues],
                err => {
                    if (err) {
                        console.error('Error inserting vehicles:', err);
                    }
                    res.redirect('/transport');
                }
            );
        } else {
            res.redirect('/transport');
        }
    });
};

// Show edit transport provider form
export const showEditTransportForm = (req, res) => {
    const user = req.session.user;
    const id = req.params.id;
    if (!user) return res.redirect('/login');

    const sql = `
        SELECT tp.*, 
               v.id AS vehicle_id, v.vehicle_type, v.max_passengers, 
               v.price_per_km, v.availability
        FROM transport_providers tp
        LEFT JOIN transport_provider_vehicles v
        ON tp.id = v.transport_provider_id
        WHERE tp.id = ? AND tp.user_id = ?
    `;

    db.query(sql, [id, user.id], (err, results) => {
        if (err || results.length === 0) return res.redirect('/transport');

        const provider = { vehicles: [] };
        results.forEach((row, index) => {
            if (index === 0) {
                Object.assign(provider, row);
                // Remove vehicle fields from main provider object
                delete provider.vehicle_id;
                delete provider.vehicle_type;
                delete provider.max_passengers;
                delete provider.price_per_km;
                delete provider.availability;
            }
            if (row.vehicle_id) {
                provider.vehicles.push({
                    id: row.vehicle_id,
                    vehicle_type: row.vehicle_type,
                    max_passengers: row.max_passengers,
                    price_per_km: row.price_per_km,
                    availability: row.availability
                });
            }
        });

        // Parse payment methods if they exist
        if (provider.payment_methods) {
            provider.payment_methods_array = provider.payment_methods.split(',');
        } else {
            provider.payment_methods_array = [];
        }

        res.render('addTransport', {
            user,
            provider,
            isEdit: true,
            error: null,
            success: null
        });
    });
};

// Update transport provider with vehicles
export const updateTransportController = (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const id = req.params.id;
    
    const {
        name,
        email,
        telephone,
        address_line1,
        address_line2,
        city,
        district,
        province,
        offers,
        'payment_methods[]': paymentMethods,
        experience_years
    } = req.body;

    const vehicles = Array.isArray(req.body.vehicles) 
        ? req.body.vehicles 
        : (req.body.vehicles ? [req.body.vehicles] : []);

    console.log("Vehicles data received:", JSON.stringify(vehicles, null, 2));

    const removedPhotos = req.body.removed_photos || [];
    const newPhotos = req.files?.length
        ? req.files.map(f => f.filename).join(',')
        : null;

    // Get existing photos
    db.query("SELECT photos FROM transport_providers WHERE id = ?", [id], (err, result) => {
        if (err) {
            console.error("Error fetching existing photos:", err);
            return res.redirect('/transport');
        }

        let existingPhotos = result[0]?.photos || '';
        
        // Filter out removed photos
        if (existingPhotos && removedPhotos.length > 0) {
            const existingArray = existingPhotos.split(',');
            const filteredArray = existingArray.filter(photo => 
                !removedPhotos.includes(photo)
            );
            existingPhotos = filteredArray.join(',');
        }

        // Combine with new photos
        const combinedPhotos = newPhotos
            ? (existingPhotos ? existingPhotos + ',' + newPhotos : newPhotos)
            : existingPhotos;

        // Delete the actual files from filesystem
        if (removedPhotos.length > 0) {
            removedPhotos.forEach(photo => {
                const filePath = path.join(process.cwd(), 'public', 'uploads', photo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        // Update transport provider details
        const updateProviderSql = `
            UPDATE transport_providers SET
            name=?, email=?, telephone=?, address_line1=?, address_line2=?, city=?, district=?, province=?,
            experience_years=?, offers=?, payment_methods=?, photos=?
            WHERE id=? AND user_id=?
        `;

        db.query(updateProviderSql, [
            name,
            email,
            telephone,
            address_line1,
            address_line2,
            city,
            district,
            province,
            experience_years,
            offers || 0,
            Array.isArray(paymentMethods) ? paymentMethods.join(',') : paymentMethods,
            combinedPhotos,
            id,
            user.id
        ], (err) => {
            if (err) {
                console.error("Error updating transport provider:", err);
                return res.redirect('/transport');
            }

            // First, get existing vehicles to know which ones to update/delete
            db.query(
                "SELECT id FROM transport_provider_vehicles WHERE transport_provider_id = ?",
                [id],
                (err, existingVehicles) => {
                    if (err) {
                        console.error("Error fetching existing vehicles:", err);
                        return res.redirect('/transport');
                    }

                    const existingVehicleIds = existingVehicles.map(v => v.id);
                    const submittedVehicleIds = vehicles
                        .filter(v => v.id)
                        .map(v => parseInt(v.id));

                    // Find vehicles to delete (exist in DB but not in submitted form)
                    const vehiclesToDelete = existingVehicleIds.filter(id => 
                        !submittedVehicleIds.includes(id)
                    );

                    // Check if any vehicles to delete have bookings
                    if (vehiclesToDelete.length > 0) {
                        const checkBookingsSql = `
                            SELECT id FROM transport_provider_bookings 
                            WHERE vehicle_id IN (?)
                            LIMIT 1
                        `;
                        
                        db.query(checkBookingsSql, [vehiclesToDelete], (err, bookingResults) => {
                            if (err) {
                                console.error("Error checking bookings:", err);
                                return res.redirect('/transport');
                            }

                            if (bookingResults.length > 0) {
                                // Vehicles have bookings, cannot delete - just update availability
                                console.log("Vehicles have bookings, cannot delete. Updating availability instead.");
                                
                                // Update all submitted vehicles
                                updateOrInsertVehicles(vehicles, id);
                                
                                // Update vehicles marked for deletion to unavailable
                                if (vehiclesToDelete.length > 0) {
                                    const markUnavailableSql = `
                                        UPDATE transport_provider_vehicles 
                                        SET availability = 0 
                                        WHERE id IN (?)
                                    `;
                                    db.query(markUnavailableSql, [vehiclesToDelete]);
                                }
                            } else {
                                // No bookings, safe to delete
                                if (vehiclesToDelete.length > 0) {
                                    const deleteSql = `
                                        DELETE FROM transport_provider_vehicles 
                                        WHERE id IN (?)
                                    `;
                                    db.query(deleteSql, [vehiclesToDelete], (deleteErr) => {
                                        if (deleteErr) {
                                            console.error("Error deleting vehicles:", deleteErr);
                                        }
                                        // Update or insert remaining vehicles
                                        updateOrInsertVehicles(vehicles, id);
                                    });
                                } else {
                                    updateOrInsertVehicles(vehicles, id);
                                }
                            }
                        });
                    } else {
                        // No vehicles to delete, just update/insert
                        updateOrInsertVehicles(vehicles, id);
                    }
                }
            );
        });
    });
};

// Helper function to update or insert vehicles
function updateOrInsertVehicles(vehicles, providerId) {
    if (!vehicles || vehicles.length === 0) return;

    vehicles.forEach((vehicle, index) => {
        // Parse numeric values
        const parsedVehicle = {
            vehicle_type: vehicle.vehicle_type || vehicle.type,
            max_passengers: parseInt(vehicle.max_passengers) || 1,
            price_per_km: parseFloat(vehicle.price_per_km) || 0,
            availability: vehicle.availability === '1' || vehicle.availability === 1 || vehicle.availability === true ? 1 : 0
        };

        console.log(`Processing vehicle ${index}:`, parsedVehicle);

        if (vehicle.id) {
            // Update existing vehicle
            const updateSql = `
                UPDATE transport_provider_vehicles SET
                vehicle_type=?, max_passengers=?, price_per_km=?, availability=?
                WHERE id=? AND transport_provider_id=?
            `;
            db.query(updateSql, [
                parsedVehicle.vehicle_type,
                parsedVehicle.max_passengers,
                parsedVehicle.price_per_km,
                parsedVehicle.availability,
                vehicle.id,
                providerId
            ], (updateErr) => {
                if (updateErr) {
                    console.error(`Error updating vehicle ${vehicle.id}:`, updateErr);
                }
            });
        } else {
            // Insert new vehicle
            const insertSql = `
                INSERT INTO transport_provider_vehicles 
                (transport_provider_id, vehicle_type, max_passengers, price_per_km, availability)
                VALUES (?, ?, ?, ?, ?)
            `;
            db.query(insertSql, [
                providerId,
                parsedVehicle.vehicle_type,
                parsedVehicle.max_passengers,
                parsedVehicle.price_per_km,
                parsedVehicle.availability
            ], (insertErr) => {
                if (insertErr) {
                    console.error(`Error inserting vehicle ${index}:`, insertErr);
                }
            });
        }
    });

    console.log("All vehicles processed successfully");
}

// Delete transport provider
export const deleteTransportController = (req, res) => {
    const user = req.session.user;
    const id = req.params.id;
    if (!user) return res.redirect('/login');

    // First get photos to delete from filesystem
    db.query('SELECT photos FROM transport_providers WHERE id = ? AND user_id = ?', [id, user.id], (err, result) => {
        if (err || result.length === 0) return res.redirect('/transport');

        const photos = result[0].photos;
        if (photos) {
            const fs = require('fs');
            const path = require('path');
            photos.split(',').forEach(photo => {
                const filePath = path.join(process.cwd(), 'public', 'uploads', photo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        // Delete vehicles first (due to foreign key constraint)
        db.query('DELETE FROM transport_provider_vehicles WHERE transport_provider_id = ?', [id], (err) => {
            if (err) console.error(err);
            
            // Delete the transport provider
            db.query('DELETE FROM transport_providers WHERE id = ? AND user_id = ?', [id, user.id], (err) => {
                if (err) console.error(err);
                res.redirect('/transport');
            });
        });
    });
};

// Get ALL transport providers (public access) - for rendering the page
export const getAllTransportProviders = (req, res) => {
    const sql = `
        SELECT 
            tp.id,
            tp.name,
            tp.email,
            tp.address_line1,
            tp.city,
            tp.district,
            tp.province,
            tp.telephone,
            tp.payment_methods,
            tp.experience_years,
            tp.offers,
            tp.photos
        FROM transport_providers tp
        ORDER BY tp.name ASC
    `;

    db.query(sql, (err, providers) => {
        if (err) {
            console.error("Error fetching transport providers:", err);
            return res.status(500).render("error", {
                message: "Database error",
                user: req.session.user || null
            });
        }

        // Process providers one by one
        const processProviders = (index) => {
            if (index >= providers.length) {
                // All providers processed, render page
                return res.render("transportProvidersBookings", {
                    title: "Transport Providers",
                    providers: providers,
                    count: providers.length,
                    user: req.session.user || null  
                });
            }

            const provider = providers[index];
            
            // Process photos
            provider.photosArray = provider.photos
                ? provider.photos.split(',').map(p => `/uploads/${p.trim()}`)
                : ['/images/default-vehicle.jpg'];

            // Get vehicles for this provider (only available ones)
            const vehicleSql = `
                SELECT 
                    id,
                    vehicle_type,
                    max_passengers,
                    price_per_km,
                    availability
                FROM transport_provider_vehicles 
                WHERE transport_provider_id = ? 
                AND availability = 1
                ORDER BY price_per_km ASC
            `;
            
            db.query(vehicleSql, [provider.id], (vehicleErr, vehicles) => {
                if (vehicleErr) {
                    console.error("Error fetching vehicle details:", vehicleErr);
                    provider.vehicles = [];
                } else {
                    provider.vehicles = vehicles;
                }
                
                // Calculate aggregated data
                if (provider.vehicles && provider.vehicles.length > 0) {
                    // Get unique vehicle types
                    provider.vehicleTypes = [...new Set(provider.vehicles.map(v => v.vehicle_type))];
                    
                    // Get min and max prices
                    const prices = provider.vehicles.map(v => parseFloat(v.price_per_km) || 0);
                    provider.min_price = prices.length > 0 ? Math.min(...prices) : 0;
                    provider.max_price = prices.length > 0 ? Math.max(...prices) : 0;
                    
                    // Get capacities as array (not string)
                    provider.capacitiesArray = provider.vehicles.map(v => v.max_passengers || 0);
                    
                    // Count available vehicles
                    provider.availableVehicles = provider.vehicles.filter(v => v.availability === 1);
                    provider.availableVehicles_count = provider.availableVehicles.length;
                } else {
                    provider.vehicleTypes = [];
                    provider.min_price = 0;
                    provider.max_price = 0;
                    provider.capacitiesArray = [];
                    provider.availableVehicles = [];
                    provider.availableVehicles_count = 0;
                }
                
                // Continue to next provider
                processProviders(index + 1);
            });
        };

        // Start processing providers
        if (providers.length > 0) {
            processProviders(0);
        } else {
            // No providers, just render
            res.render("transportProvidersBookings", {
                title: "Transport Providers",
                providers: [],
                count: 0,
                user: req.session.user || null  
            });
        }
    });
};

// Get transport provider details by ID
export const getTransportProviderById = (req, res) => {
    const providerId = req.params.id;

    const sql = `
        SELECT 
            tp.id,
            tp.name,
            tp.email,
            tp.address_line1,
            tp.address_line2,
            tp.city,
            tp.district,
            tp.province,
            tp.telephone,
            tp.payment_methods,
            tp.experience_years,
            tp.offers,
            tp.photos,
            tpv.id AS vehicle_id,
            tpv.vehicle_type,
            tpv.max_passengers,
            tpv.price_per_km,
            tpv.availability
        FROM transport_providers tp
        LEFT JOIN transport_provider_vehicles tpv 
            ON tp.id = tpv.transport_provider_id
        WHERE tp.id = ?
        ORDER BY tpv.price_per_km ASC
    `;

    db.query(sql, [providerId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).render("error", {
                message: "Database error",
                user: req.session.user || null
            });
        }

        if (results.length === 0) {
            return res.status(404).render("error", {
                message: "Transport provider not found",
                user: req.session.user || null
            });
        }

        const provider = {
            id: results[0].id,
            name: results[0].name,
            email: results[0].email,
            address_line1: results[0].address_line1,
            address_line2: results[0].address_line2,
            city: results[0].city,
            district: results[0].district,
            province: results[0].province,
            telephone: results[0].telephone,
            payment_methods: results[0].payment_methods,
            experience_years: results[0].experience_years,
            offers: results[0].offers,
            photosArray: results[0].photos
                ? results[0].photos.split(',').map(p => `/uploads/${p.trim()}`)
                : ['/images/default-vehicle.jpg'],
            vehicles: []
        };

        results.forEach(row => {
            if (row.vehicle_id) {
                provider.vehicles.push({
                    id: row.vehicle_id,
                    vehicle_type: row.vehicle_type,
                    max_passengers: row.max_passengers,
                    price_per_km: row.price_per_km,
                    availability: row.availability
                });
            }
        });

        res.render("transportProvidersBookings", {
            title: "Transport Provider Details",
            provider: provider,
            providers: [provider], 
            user: req.session.user || null
        });
    });
};

//handle booking-------------

// Create transport booking
export const createTransportBooking = (req, res) => {
    const user = req.session.user;
    
    if (!user) {
        return res.status(401).json({ 
            success: false, 
            message: 'Please login to book transport' 
        });
    }
    
    const {
        transport_provider_id,
        vehicle_id,
        pickup_location,
        destination_locations,
        start_date,
        end_date,
        notes
    } = req.body;
    
    // Validation
    if (!transport_provider_id || !vehicle_id || !pickup_location || !start_date || !end_date) {
        return res.status(400).json({
            success: false,
            message: 'Please fill all required fields'
        });
    }
    
    // Simple date validation
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (startDate >= endDate) {
        return res.status(400).json({
            success: false,
            message: 'End date must be after start date'
        });
    }
    
    // Check vehicle availability
    const checkSql = `
        SELECT id 
        FROM transport_provider_vehicles 
        WHERE id = ? 
        AND transport_provider_id = ?
        AND availability = 1
    `;
    
    db.query(checkSql, [vehicle_id, transport_provider_id], (checkErr, checkResults) => {
        if (checkErr) {
            console.error('Check error:', checkErr);
            return res.status(500).json({
                success: false,
                message: 'Database error'
            });
        }
        
        if (checkResults.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vehicle not available for booking'
            });
        }
        
        // Insert booking
        const insertSql = `
            INSERT INTO transport_provider_bookings 
            (user_id, transport_provider_id, vehicle_id, 
             pickup_location, destination_locations, 
             start_date, end_date, notes, booking_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const bookingValues = [
            user.id,
            transport_provider_id,
            vehicle_id,
            pickup_location,
            destination_locations || '',
            start_date,
            end_date,
            notes || '',
            0  // booking_status: 0 = pending
        ];
        
        db.query(insertSql, bookingValues, (insertErr, results) => {
            if (insertErr) {
                console.error('Insert error:', insertErr);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }
            
            res.json({
                success: true,
                message: 'Booking created successfully',
                bookingId: results.insertId
            });
        });
    });
};

export const getTransportBookingsByProviderId = (req, res) => {
    const user = req.session.user;

    // 🔐 Login check
    if (!user) return res.redirect('/login');

    // 🔐 Role check
    if (user.role.toUpperCase() !== "TRANSPORT PROVIDER") {
        return res.status(403).send("Access denied");
    }

    const providerId = req.params.providerId;
    if (!providerId) {
        return res.status(400).send("Provider ID is required");
    }

    // 🔎 Make sure this provider belongs to the logged-in user
    const providerSql = `
        SELECT id, name, email
        FROM transport_providers
        WHERE id = ? AND user_id = ?
    `;

    db.query(providerSql, [providerId, user.id], (err, providerRows) => {
        if (err) {
            console.error("Provider fetch error:", err);
            return res.status(500).send("Database error");
        }

        if (providerRows.length === 0) {
            return res.status(404).send("Transport provider not found");
        }

        const provider = providerRows[0];

        // 🚐 Get bookings for THIS transport provider only
        const bookingSql = `
            SELECT 
                tb.*,
                u.name  AS guest_name,
                u.email AS guest_email,
                u.phone AS guest_contact
            FROM transport_provider_bookings tb
            LEFT JOIN users u ON tb.user_id = u.id
            WHERE tb.transport_provider_id = ?
            ORDER BY tb.created_at DESC
        `;

        db.query(bookingSql, [providerId], (err, bookings) => {
            if (err) {
                console.error("Booking fetch error:", err);
                return res.status(500).send("Database error");
            }

            // 🧮 Format booking data
            bookings.forEach(b => {
                const start = new Date(b.start_date);
                const end = new Date(b.end_date);

                b.days = Math.max(
                    1,
                    Math.ceil((end - start) / (1000 * 60 * 60 * 24))
                );

                b.start_formatted = start.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                b.end_formatted = end.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                const statusMap = {
                    0: { text: "Pending", class: "status-pending" },
                    1: { text: "Confirmed", class: "status-confirmed" },
                    2: { text: "Cancelled", class: "status-cancelled" }
                };

                b.status_info = statusMap[b.booking_status] || statusMap[0];
                b.destinations = b.destination_locations || "N/A";
            });

            let totalRevenue = 0;

bookings.forEach(b => {
    if (b.booking_status === 1 && b.rate_per_day) { // confirmed only
        totalRevenue += Number(b.rate_per_day) * b.days;
    }

    // created date formatting (you are using this in EJS)
    const created = new Date(b.created_at);
    b.created_formatted = created.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
});

const stats = {
    pending: bookings.filter(b => b.booking_status === 0).length,
    confirmed: bookings.filter(b => b.booking_status === 1).length,
    total: bookings.length,
    revenue: totalRevenue   // ✅ VERY IMPORTANT
};

            // 🎨 Render page
            res.render("viewTrasnportBookings", {
                user,
                provider,
                bookings,
                stats,
                providerId
            });
        });
    });
};

// Update transport booking status (by transport_provider_id)
export const updateTransportBookingStatus = (req, res) => {
    const user = req.session.user;

    if (!user || user.role.toUpperCase() !== "TRANSPORT PROVIDER") { // FIXED: Space in "TRANSPORT PROVIDER"
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const bookingId = req.params.bookingId;
    const { status } = req.body;

    if (![0, 1, 2].includes(Number(status))) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Verify booking belongs to provider
    const verifySql = `
        SELECT tb.vehicle_id, tb.transport_provider_id
        FROM transport_provider_bookings tb
        JOIN transport_providers tp ON tb.transport_provider_id = tp.id
        WHERE tb.id = ? AND tp.user_id = ?
    `;

    db.query(verifySql, [bookingId, user.id], (err, results) => {
        if (err) {
            console.error("Verification error:", err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found or unauthorized' });
        }

        const vehicleId = results[0].vehicle_id;
        const providerId = results[0].transport_provider_id;

        // Update booking status
        const updateSql = `
            UPDATE transport_provider_bookings
            SET booking_status = ?
            WHERE id = ?
        `;

        db.query(updateSql, [status, bookingId], (updateErr) => {
            if (updateErr) {
                console.error("Update error:", updateErr);
                return res.status(500).json({ success: false, message: 'Failed to update booking' });
            }

            // If confirmed → mark vehicle unavailable
            if (Number(status) === 1) {
                db.query(
                    `UPDATE transport_provider_vehicles SET availability = 0 WHERE id = ?`,
                    [vehicleId]
                );
            }
            
            // If cancelled and was previously confirmed → mark vehicle available again
            if (Number(status) === 2) {
                // Check if it was previously confirmed
                const checkSql = `SELECT booking_status FROM transport_provider_bookings WHERE id = ?`;
                db.query(checkSql, [bookingId], (checkErr, checkResults) => {
                    if (!checkErr && checkResults.length > 0 && checkResults[0].booking_status === 1) {
                        db.query(
                            `UPDATE transport_provider_vehicles SET availability = 1 WHERE id = ?`,
                            [vehicleId]
                        );
                    }
                });
            }

            const statusText =
                status == 1 ? 'confirmed' :
                status == 2 ? 'cancelled' :
                'pending';

            res.json({
                success: true,
                message: `Booking has been ${statusText} successfully`,
                providerId: providerId
            });
        });
    });
};

//-----------tourist view all bookings -----------

// Get all bookings for a specific user (tourist)
export const getAllUserBookings = (req, res) => {
    const user = req.session.user;

    // Login check
    if (!user) return res.redirect('/login');
    
    // Only tourists should access this page
    if (user.role.toUpperCase() !== "TOURIST") {
        return res.status(403).send("Access denied. This page is for tourists only.");
    }

    const userId = user.id;
    
    // Fetch all bookings for this user across all services
    Promise.all([
        // 1. Hotel Bookings
        new Promise((resolve, reject) => {
            const hotelSql = `
                SELECT 
                    hb.*,
                    h.name as hotel_name,
                    CONCAT(h.city, ', ', h.district) as hotel_location,
                    h.photos as hotel_photos,
                    u.name as owner_name
                FROM hotel_bookings hb
                LEFT JOIN hotels h ON hb.hotel_id = h.id
                LEFT JOIN users u ON h.user_id = u.id
                WHERE hb.user_id = ?
                ORDER BY hb.created_at DESC
            `;
            db.query(hotelSql, [userId], (err, hotelBookings) => {
                if (err) {
                    console.error("Error fetching hotel bookings:", err);
                    reject(err);
                } else {
                    // Format hotel bookings
                    hotelBookings.forEach(booking => {
                        booking.type = 'hotel';
                        booking.service_name = booking.hotel_name;
                        booking.location = booking.hotel_location;
                        booking.image = booking.hotel_photos ? booking.hotel_photos.split(',')[0] : null;
                        
                        // Format dates
                        booking.start_date = booking.checkin_date;
                        booking.end_date = booking.checkout_date;
                        
                        // Calculate nights
                        const checkIn = new Date(booking.checkin_date);
                        const checkOut = new Date(booking.checkout_date);
                        booking.duration = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                        
                        // Status mapping
                        booking.status_text = getStatusText(booking.booking_status);
                        booking.status_class = getStatusClass(booking.booking_status);
                        
                        // Format dates for display
                        booking.start_formatted = formatDate(checkIn);
                        booking.end_formatted = formatDate(checkOut);
                        booking.created_formatted = formatDate(new Date(booking.created_at));
                        
                        // Check if booking is ongoing
                        const today = new Date();
                        booking.is_ongoing = checkIn <= today && checkOut >= today;
                        booking.is_upcoming = checkIn > today;
                        booking.is_completed = checkOut < today;
                    });
                    resolve(hotelBookings);
                }
            });
        }),
        
        // 2. Tour Guide Bookings
        new Promise((resolve, reject) => {
            const guideSql = `
                SELECT 
                    tgb.*,
                    tg.name as guide_name,
                    CONCAT(tg.city, ', ', tg.district) as guide_location,
                    tg.photos as guide_photos,
                    tg.languages,
                    tg.price_per_day,
                    u.name as owner_name
                FROM tour_guide_bookings tgb
                LEFT JOIN tour_guides tg ON tgb.guide_id = tg.id
                LEFT JOIN users u ON tg.user_id = u.id
                WHERE tgb.user_id = ?
                ORDER BY tgb.created_at DESC
            `;
            db.query(guideSql, [userId], (err, guideBookings) => {
                if (err) {
                    console.error("Error fetching guide bookings:", err);
                    reject(err);
                } else {
                    // Format guide bookings
                    guideBookings.forEach(booking => {
                        booking.type = 'tour_guide';
                        booking.service_name = booking.guide_name;
                        booking.location = booking.guide_location;
                        booking.image = booking.guide_photos ? booking.guide_photos.split(',')[0] : null;
                        booking.specialization = booking.languages; // Using languages as specialization
                        
                        // Set dates
                        booking.start_date = booking.booking_date;
                        const endDate = new Date(booking.booking_date);
                        endDate.setDate(endDate.getDate() + booking.no_of_days);
                        booking.end_date = endDate.toISOString().split('T')[0];
                        
                        booking.duration = booking.no_of_days;
                        
                        // Status mapping
                        booking.status_text = getStatusText(booking.booking_status);
                        booking.status_class = getStatusClass(booking.booking_status);
                        
                        // Format dates for display
                        booking.start_formatted = formatDate(new Date(booking.booking_date));
                        booking.end_formatted = formatDate(endDate);
                        booking.created_formatted = formatDate(new Date(booking.created_at));
                        
                        // Check if booking is ongoing
                        const today = new Date();
                        const startDate = new Date(booking.booking_date);
                        booking.is_ongoing = startDate <= today && endDate >= today;
                        booking.is_upcoming = startDate > today;
                        booking.is_completed = endDate < today;
                    });
                    resolve(guideBookings);
                }
            });
        }),
        
        // 3. Transport Provider Bookings
        new Promise((resolve, reject) => {
            const transportSql = `
                SELECT 
                    tpb.*,
                    tp.name as provider_name,
                    CONCAT(tp.city, ', ', tp.district) as provider_location,
                    tp.photos as provider_photos,
                    v.vehicle_type,
                    v.price_per_km,
                    u.name as owner_name
                FROM transport_provider_bookings tpb
                LEFT JOIN transport_providers tp ON tpb.transport_provider_id = tp.id
                LEFT JOIN transport_provider_vehicles v ON tpb.vehicle_id = v.id
                LEFT JOIN users u ON tp.user_id = u.id
                WHERE tpb.user_id = ?
                ORDER BY tpb.created_at DESC
            `;
            db.query(transportSql, [userId], (err, transportBookings) => {
                if (err) {
                    console.error("Error fetching transport bookings:", err);
                    reject(err);
                } else {
                    // Format transport bookings
                    transportBookings.forEach(booking => {
                        booking.type = 'transport';
                        booking.service_name = booking.provider_name;
                        booking.location = booking.provider_location;
                        booking.image = booking.provider_photos ? booking.provider_photos.split(',')[0] : null;
                        booking.vehicle_details = `${booking.vehicle_type || 'Vehicle'} (${booking.price_per_km || '0'} LKR/km)`;
                        
                        // Set dates
                        booking.start_date = booking.start_date;
                        booking.end_date = booking.end_date;
                        
                        // Calculate days
                        const start = new Date(booking.start_date);
                        const end = new Date(booking.end_date);
                        booking.duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                        
                        // Status mapping
                        booking.status_text = getStatusText(booking.booking_status);
                        booking.status_class = getStatusClass(booking.booking_status);
                        
                        // Format dates for display
                        booking.start_formatted = formatDate(start);
                        booking.end_formatted = formatDate(end);
                        booking.created_formatted = formatDate(new Date(booking.created_at));
                        
                        // Check if booking is ongoing
                        const today = new Date();
                        booking.is_ongoing = start <= today && end >= today;
                        booking.is_upcoming = start > today;
                        booking.is_completed = end < today;
                    });
                    resolve(transportBookings);
                }
            });
        })
    ])
    .then(([hotelBookings, guideBookings, transportBookings]) => {
        // Combine all bookings
        const allBookings = [
            ...hotelBookings,
            ...guideBookings,
            ...transportBookings
        ];
        
        // Sort by creation date (newest first)
        allBookings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Categorize bookings
        const ongoingBookings = allBookings.filter(b => b.is_ongoing);
        const upcomingBookings = allBookings.filter(b => b.is_upcoming);
        const completedBookings = allBookings.filter(b => b.is_completed);
        
        // Statistics
        const stats = {
            total: allBookings.length,
            ongoing: ongoingBookings.length,
            upcoming: upcomingBookings.length,
            completed: completedBookings.length,
            hotels: hotelBookings.length,
            guides: guideBookings.length,
            transport: transportBookings.length
        };
        
        res.render('touristViewBookings', {
            user,
            bookings: allBookings,
            ongoingBookings,
            upcomingBookings,
            completedBookings,
            stats,
            hotelBookings,
            guideBookings,
            transportBookings,
            calculateRemainingDays: function(endDate) {
        const end = new Date(endDate);
        const today = new Date();
        const diffTime = end - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    }
        });
    })
    .catch(error => {
        console.error("Error fetching all bookings:", error);
        res.status(500).send("Error loading booking history");
    });
};

// Get filtered bookings by type
export const getUserBookingsByType = (req, res) => {
    const user = req.session.user;

    if (!user) return res.redirect('/login');
    if (user.role.toUpperCase() !== "TOURIST") {
        return res.status(403).send("Access denied");
    }

    const userId = user.id;
    let type = req.params.type; // 'hotel', 'tour-guide', or 'transport'
    
    // Normalize the type name
    if (type === 'tour-guide') {
        type = 'tour_guide'; // Convert to database format
    }
    
    let sql;
    
    switch(type) {
        case 'hotel':
            sql = `
                SELECT 
                    hb.*,
                    h.name as service_name,
                    CONCAT(h.city, ', ', h.district) as service_location,
                    h.photos as service_photos,
                    u.name as owner_name
                FROM hotel_bookings hb
                LEFT JOIN hotels h ON hb.hotel_id = h.id
                LEFT JOIN users u ON h.user_id = u.id
                WHERE hb.user_id = ?
                ORDER BY hb.created_at DESC
            `;
            break;
        case 'tour_guide':
            sql = `
                SELECT 
                    tgb.*,
                    tg.name as service_name,
                    CONCAT(tg.city, ', ', tg.district) as service_location,
                    tg.photos as service_photos,
                    tg.languages,
                    tg.price_per_day,
                    u.name as owner_name
                FROM tour_guide_bookings tgb
                LEFT JOIN tour_guides tg ON tgb.guide_id = tg.id
                LEFT JOIN users u ON tg.user_id = u.id
                WHERE tgb.user_id = ?
                ORDER BY tgb.created_at DESC
            `;
            break;
        case 'transport':
            sql = `
                SELECT 
                    tpb.*,
                    tp.name as service_name,
                    CONCAT(tp.city, ', ', tp.district) as service_location,
                    tp.photos as service_photos,
                    v.vehicle_type,
                    v.price_per_km,
                    u.name as owner_name
                FROM transport_provider_bookings tpb
                LEFT JOIN transport_providers tp ON tpb.transport_provider_id = tp.id
                LEFT JOIN transport_provider_vehicles v ON tpb.vehicle_id = v.id
                LEFT JOIN users u ON tp.user_id = u.id
                WHERE tpb.user_id = ?
                ORDER BY tpb.created_at DESC
            `;
            break;
        default:
            return res.status(400).send("Invalid booking type");
    }
    
    db.query(sql, [userId], (err, bookings) => {
        if (err) {
            console.error(`Error fetching ${type} bookings:`, err);
            return res.status(500).send("Database error");
        }
        
        // Format bookings
        bookings.forEach(booking => {
            booking.type = type; // Use the normalized type
            
            // Set dates based on type
            if (type === 'hotel') {
                booking.start_date = booking.checkin_date;
                booking.end_date = booking.checkout_date;
                const checkIn = new Date(booking.checkin_date);
                const checkOut = new Date(booking.checkout_date);
                booking.duration = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                booking.start_formatted = formatDate(checkIn);
                booking.end_formatted = formatDate(checkOut);
                
                // Calculate remaining days
                booking.remaining_days = calculateRemainingDays(booking.end_date);
                
            } else if (type === 'tour_guide') {
                booking.start_date = booking.booking_date;
                const endDate = new Date(booking.booking_date);
                endDate.setDate(endDate.getDate() + booking.no_of_days);
                booking.end_date = endDate.toISOString().split('T')[0];
                booking.duration = booking.no_of_days;
                booking.start_formatted = formatDate(new Date(booking.booking_date));
                booking.end_formatted = formatDate(endDate);
                
                // Calculate remaining days
                booking.remaining_days = calculateRemainingDays(booking.end_date);
                
            } else {
                booking.start_date = booking.start_date;
                booking.end_date = booking.end_date;
                const start = new Date(booking.start_date);
                const end = new Date(booking.end_date);
                booking.duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                booking.start_formatted = formatDate(start);
                booking.end_formatted = formatDate(end);
                
                // Calculate remaining days
                booking.remaining_days = calculateRemainingDays(booking.end_date);
            }
            
            // Status
            booking.status_text = getStatusText(booking.booking_status);
            booking.status_class = getStatusClass(booking.booking_status);
            booking.created_formatted = formatDate(new Date(booking.created_at));
            
            // Check time status
            const today = new Date();
            const startDate = new Date(booking.start_date);
            const endDate = new Date(booking.end_date);
            booking.is_ongoing = startDate <= today && endDate >= today;
            booking.is_upcoming = startDate > today;
            booking.is_completed = endDate < today;
        });
        
        // Categorize
        const ongoingBookings = bookings.filter(b => b.is_ongoing);
        const upcomingBookings = bookings.filter(b => b.is_upcoming);
        const completedBookings = bookings.filter(b => b.is_completed);
        
        res.render('touristViewBookings', {
            user,
            bookings,
            ongoingBookings,
            upcomingBookings,
            completedBookings,
            stats: {
                total: bookings.length,
                ongoing: ongoingBookings.length,
                upcoming: upcomingBookings.length,
                completed: completedBookings.length,
                hotels: type === 'hotel' ? bookings.length : 0,
                guides: type === 'tour_guide' ? bookings.length : 0,
                transport: type === 'transport' ? bookings.length : 0
            },
            filterType: req.params.type, // Use the original type from URL
            typeName: getTypeName(type)
        });
    });
};

// Generate travel suggestions based on booking history
export const generateTravelSuggestions = (req, res) => {
    const user = req.session.user;

    if (!user) return res.redirect('/login');
    if (user.role.toUpperCase() !== "TOURIST") {
        return res.status(403).send("Access denied");
    }

    const userId = user.id;
    
    // First, get all bookings to maintain the page structure
    Promise.all([
        // Get hotel locations for analysis
        new Promise((resolve) => {
            const sql = `
                SELECT DISTINCT CONCAT(h.city, ', ', h.district) as location 
                FROM hotel_bookings hb
                JOIN hotels h ON hb.hotel_id = h.id
                WHERE hb.user_id = ? AND hb.booking_status = 1
            `;
            db.query(sql, [userId], (err, results) => {
                resolve(err ? [] : results.map(r => r.location));
            });
        }),
        
        // Get guide languages for analysis
        new Promise((resolve) => {
            const sql = `
                SELECT DISTINCT tg.languages 
                FROM tour_guide_bookings tgb
                JOIN tour_guides tg ON tgb.guide_id = tg.id
                WHERE tgb.user_id = ? AND tgb.booking_status = 1
            `;
            db.query(sql, [userId], (err, results) => {
                resolve(err ? [] : results.map(r => r.languages));
            });
        }),
        
        // Get transport destinations for analysis
        new Promise((resolve) => {
            const sql = `
                SELECT DISTINCT destination_locations 
                FROM transport_provider_bookings 
                WHERE user_id = ? AND booking_status = 1
            `;
            db.query(sql, [userId], (err, results) => {
                const destinations = [];
                results.forEach(r => {
                    if (r.destination_locations) {
                        destinations.push(...r.destination_locations.split(',').map(d => d.trim()));
                    }
                });
                resolve(destinations);
            });
        }),
        
        // Get all bookings for stats
        new Promise((resolve) => {
            // Get hotel bookings count
            const hotelSql = `SELECT COUNT(*) as count FROM hotel_bookings WHERE user_id = ?`;
            const guideSql = `SELECT COUNT(*) as count FROM tour_guide_bookings WHERE user_id = ?`;
            const transportSql = `SELECT COUNT(*) as count FROM transport_provider_bookings WHERE user_id = ?`;
            
            Promise.all([
                new Promise((res) => db.query(hotelSql, [userId], (err, r) => res(err ? 0 : r[0].count))),
                new Promise((res) => db.query(guideSql, [userId], (err, r) => res(err ? 0 : r[0].count))),
                new Promise((res) => db.query(transportSql, [userId], (err, r) => res(err ? 0 : r[0].count)))
            ]).then(([hotels, guides, transport]) => {
                resolve({
                    hotels: parseInt(hotels),
                    guides: parseInt(guides),
                    transport: parseInt(transport),
                    total: parseInt(hotels) + parseInt(guides) + parseInt(transport)
                });
            });
        })
    ])
    .then(([hotelLocations, guideLanguages, transportDestinations, stats]) => {
        // Analyze user preferences
        const preferences = analyzePreferences(hotelLocations, guideLanguages, transportDestinations);
        
        // Generate itinerary suggestions
        const suggestions = generateItinerarySuggestions(preferences);
        
        // Get popular destinations in Sri Lanka
        const popularDestinations = getPopularDestinations();
        
        // Create a simple HTML for suggestions to be loaded via AJAX
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            // AJAX request - return only suggestions HTML
            const suggestionsHTML = `
                <div class="suggestions-grid">
                    <!-- User Preferences -->
                    <div class="preferences-card">
                        <h3><i class="fas fa-user-check"></i> Your Travel Profile</h3>
                        <div class="preference-section">
                            <h4>Preferred Destinations:</h4>
                            ${preferences.preferredDestinations.length > 0 
                                ? `<ul class="preferences-list">
                                    ${preferences.preferredDestinations.map(dest => `<li>${dest}</li>`).join('')}
                                   </ul>`
                                : '<p class="text-muted">Not enough data to determine</p>'
                            }
                        </div>
                        <div class="preference-section">
                            <h4>Interests:</h4>
                            ${preferences.interests.length > 0 
                                ? `<ul class="preferences-list">
                                    ${preferences.interests.map(interest => `<li>${interest}</li>`).join('')}
                                   </ul>`
                                : '<p class="text-muted">Not enough data to determine</p>'
                            }
                        </div>
                    </div>
                    
                    <!-- Personalized Suggestions -->
                    <div class="suggestions-list">
                        <h3><i class="fas fa-map-marked-alt"></i> Recommended Itineraries</h3>
                        ${suggestions.map((suggestion, index) => `
                            <div class="suggestion-card">
                                <div class="suggestion-header">
                                    <h4>${suggestion.title}</h4>
                                    <span class="badge bg-info">${suggestion.duration}</span>
                                </div>
                                <p class="suggestion-description">${suggestion.description}</p>
                                <div class="suggestion-details">
                                    <span class="detail-item">
                                        <i class="fas fa-money-bill-wave"></i> ${suggestion.estimatedCost}
                                    </span>
                                    <span class="detail-item">
                                        <i class="fas fa-mountain"></i> ${suggestion.difficulty}
                                    </span>
                                </div>
                                <div class="suggestion-activities">
                                    <strong>Activities:</strong>
                                    <p>${suggestion.activities.join(', ')}</p>
                                </div>
                                <button class="btn btn-outline-light btn-sm mt-2" onclick="planThisTrip(${index})">
                                    <i class="fas fa-plus"></i> Add to Plan
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- Popular Destinations -->
                    <div class="popular-destinations">
                        <h3><i class="fas fa-star"></i> Popular in Sri Lanka</h3>
                        <div class="destinations-grid">
                            ${popularDestinations.map(destination => `
                                <div class="destination-card">
                                    <h5>${destination.name}</h5>
                                    <span class="destination-type">${destination.type}</span>
                                    <p class="destination-description">${destination.description}</p>
                                    <div class="destination-highlights">
                                        <strong>Best Season:</strong> ${destination.bestSeason}<br>
                                        <strong>Highlights:</strong> ${destination.highlights.join(', ')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            
            res.send(suggestionsHTML);
        } else {
            // Full page request - render the complete page
            res.render('touristViewBookings', {
                user,
                showSuggestions: true,
                preferences,
                suggestions,
                popularDestinations,
                hotelLocations: [...new Set(hotelLocations)],
                guideLanguages: [...new Set(guideLanguages)],
                transportDestinations: [...new Set(transportDestinations)],
                stats: {
                    total: stats.total,
                    ongoing: 0,
                    upcoming: 0,
                    completed: 0,
                    hotels: stats.hotels,
                    guides: stats.guides,
                    transport: stats.transport
                },
                bookings: [], // Empty array since we're showing suggestions
                ongoingBookings: [],
                upcomingBookings: [],
                completedBookings: [],
                calculateRemainingDays: function(endDate) {
                    const end = new Date(endDate);
                    const today = new Date();
                    const diffTime = end - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays > 0 ? diffDays : 0;
                }
            });
        }
    })
    .catch(error => {
        console.error("Error generating suggestions:", error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            res.status(500).send('<div class="alert alert-danger">Error generating suggestions. Please try again.</div>');
        } else {
            res.status(500).send("Error generating travel suggestions");
        }
    });
};

// Share itinerary
export const shareItinerary = (req, res) => {
    const user = req.session.user;
    const bookingId = req.params.id;
    const type = req.params.type;
    
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    
    // Logic to share booking (email, social media, etc.)
    // This would typically integrate with an email service or social media API
    
    res.json({
        success: true,
        message: "Booking shared successfully",
        shareLink: `/bookings/share/${type}/${bookingId}`
    });
};

// Helper functions
function getStatusText(status) {
    const statusMap = {
        0: "Pending",
        1: "Confirmed",
        2: "Cancelled"
    };
    return statusMap[status] || "Unknown";
}

function getStatusClass(status) {
    const classMap = {
        0: "status-pending",
        1: "status-confirmed",
        2: "status-cancelled"
    };
    return classMap[status] || "status-unknown";
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function getTypeName(type) {
    const typeMap = {
        'hotel': 'Hotel',
        'tour-guide': 'Tour Guide',
        'tour_guide': 'Tour Guide',
        'transport': 'Transport'
    };
    return typeMap[type] || type;
}

function analyzePreferences(hotelLocations, guideLanguages, transportDestinations) {
    const preferences = {
        preferredDestinations: [],
        interests: [],
        travelStyle: 'balanced'
    };
    
    // Analyze most visited destinations
    const locationCount = {};
    hotelLocations.forEach(loc => {
        if (loc) {
            locationCount[loc] = (locationCount[loc] || 0) + 1;
        }
    });
    transportDestinations.forEach(dest => {
        if (dest) {
            locationCount[dest] = (locationCount[dest] || 0) + 1;
        }
    });
    
    preferences.preferredDestinations = Object.entries(locationCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([location]) => location);
    
    // Analyze interests from guide languages
    const interestCount = {};
    guideLanguages.forEach(lang => {
        if (lang) {
            const languages = lang.toLowerCase().split(/[,\s]+/);
            languages.forEach(language => {
                if (language.length > 3) {
                    interestCount[language] = (interestCount[language] || 0) + 1;
                }
            });
        }
    });
    
    preferences.interests = Object.entries(interestCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([interest]) => interest);
    
    return preferences;
}

function generateItinerarySuggestions(preferences) {
    const suggestions = [];
    
    // Based on preferences, generate itinerary ideas
    if (preferences.preferredDestinations.length > 0) {
        suggestions.push({
            title: "Return to Favorite Destination",
            description: `Based on your history, consider visiting ${preferences.preferredDestinations[0]} again with new activities.`,
            duration: "3-5 days",
            estimatedCost: "$$",
            difficulty: "Easy",
            activities: ["Explore new areas", "Try local cuisine", "Visit cultural sites"]
        });
    }
    
    if (preferences.interests.some(interest => 
        ['culture', 'historical', 'heritage', 'temple', 'religious'].includes(interest))) {
        suggestions.push({
            title: "Cultural Heritage Tour",
            description: "Explore Sri Lanka's rich cultural heritage with temple visits and traditional experiences.",
            duration: "5-7 days",
            estimatedCost: "$$$",
            difficulty: "Moderate",
            activities: ["Visit ancient cities", "Temple tours", "Traditional dance shows", "Local craft workshops"]
        });
    }
    
    if (preferences.interests.some(interest => 
        ['beach', 'coastal', 'sea', 'ocean', 'surfing'].includes(interest))) {
        suggestions.push({
            title: "Coastal Getaway",
            description: "Relax on Sri Lanka's beautiful beaches with water sports and seafood cuisine.",
            duration: "4-6 days",
            estimatedCost: "$$",
            difficulty: "Easy",
            activities: ["Beach relaxation", "Snorkeling", "Whale watching", "Sunset cruises"]
        });
    }
    
    // Add more suggestion types as needed
    suggestions.push({
        title: "Adventure Expedition",
        description: "For the adventurous traveler: hiking, wildlife safaris, and outdoor activities.",
        duration: "6-8 days",
        estimatedCost: "$$$$",
        difficulty: "Challenging",
        activities: ["Mountain hiking", "Wildlife safaris", "Water rafting", "Camping"]
    });
    
    suggestions.push({
        title: "Wellness & Yoga Retreat",
        description: "Rejuvenate with yoga, meditation, and Ayurvedic treatments in serene locations.",
        duration: "4-7 days",
        estimatedCost: "$$$",
        difficulty: "Easy",
        activities: ["Yoga sessions", "Meditation", "Ayurvedic treatments", "Healthy cuisine"]
    });
    
    return suggestions;
}

function getPopularDestinations() {
    return [
        { 
            name: "Kandy", 
            type: "Cultural", 
            bestSeason: "Jan-Apr", 
            highlights: ["Temple of the Tooth", "Royal Botanical Gardens", "Kandy Lake"],
            description: "Cultural capital with rich heritage and scenic beauty"
        },
        { 
            name: "Galle", 
            type: "Coastal/Historical", 
            bestSeason: "Nov-Mar", 
            highlights: ["Galle Fort", "Unawatuna Beach", "Dutch Architecture"],
            description: "Historic Dutch fort with beautiful beaches"
        },
        { 
            name: "Ella", 
            type: "Mountain/Adventure", 
            bestSeason: "Jan-May", 
            highlights: ["Ella Rock", "Nine Arch Bridge", "Tea Plantations"],
            description: "Hill country paradise with stunning views"
        },
        { 
            name: "Sigiriya", 
            type: "Historical", 
            bestSeason: "Jan-Apr", 
            highlights: ["Sigiriya Rock Fortress", "Ancient Frescoes", "Water Gardens"],
            description: "Ancient rock fortress and UNESCO World Heritage site"
        },
        { 
            name: "Mirissa", 
            type: "Coastal", 
            bestSeason: "Nov-Apr", 
            highlights: ["Whale Watching", "Secret Beach", "Surfing"],
            description: "Best spot for whale watching and beach relaxation"
        },
        { 
            name: "Nuwara Eliya", 
            type: "Hill Country", 
            bestSeason: "Mar-May", 
            highlights: ["Tea Estates", "Horton Plains", "Waterfalls"],
            description: "Little England with cool climate and tea plantations"
        }
    ];
}
