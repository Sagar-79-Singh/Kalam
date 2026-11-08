package main

import (
	_ "embed"
	"regexp"
)

//go:embed frontend/src/constants.ts
var productConstants string

func applicationName() string {
	match := regexp.MustCompile(`export const APP_NAME = ['"]([^'"]+)['"]`).FindStringSubmatch(productConstants)
	if len(match) != 2 {
		panic("APP_NAME is missing from frontend/src/constants.ts")
	}
	return match[1]
}
