import multer from "multer";

// Multer storage (save files and maintain extension)
const storage = multer.diskStorage({
    destination: 'uploads', 
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '_' + Date.now() + '_' + file.originalname);
    }
});

// File size limitations (1MB here)
export const upload = multer({
    storage,
    limits: {
        fileSize: 1024 * 1024 
    }
});

// Controller for handling multiple fields
export const uploadController = 
    (req, res) => {
        // Uploaded files info
        console.log(req.files); 
        console.log(req.files);    

        res.json({
            message: "Files uploaded successfully",
            files: req.files
        });
    }
