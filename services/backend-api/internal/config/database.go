package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"services/backend-api/internal/models"
)

var DB *gorm.DB

func ConnectDatabase() {
	_ = godotenv.Load()

	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "root:root@tcp(127.0.0.1:3306)/parking_db?charset=utf8mb4&parseTime=True&loc=Local"
	}

	database, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		fallbackDsn := "root:@tcp(127.0.0.1:3306)/parking_db?charset=utf8mb4&parseTime=True&loc=Local"
		database, err = gorm.Open(mysql.Open(fallbackDsn), &gorm.Config{})
		if err != nil {
			log.Fatalf("Gagal terhubung ke MySQL lokal: %v", err)
		}
	}

	database.AutoMigrate(&models.User{})
	DB = database
	log.Println("✅ MySQL lokal connected & user schema migrated")
}

