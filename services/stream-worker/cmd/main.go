package main

import (
	"log"
	"time"
)

func main() {
	log.Println("Stream worker standby. CDC and Kafka pipeline are deferred in local setup.")
	for {
		time.Sleep(1 * time.Hour)
	}
}

