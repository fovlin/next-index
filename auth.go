package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	passwordScheme     = "pbkdf2-sha256"
	pbkdf2Iterations   = 210000
	pbkdf2KeyLength    = 32
	pbkdf2SaltLength   = 16
	passwordAlphabet   = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	sessionCookieName  = "next_index_session"
	sessionDuration    = 12 * time.Hour
	sessionTokenLength = 32
)

func pbkdf2SHA256(password, salt []byte, iterations int, keyLength int) []byte {
	prf := hmac.New(sha256.New, password)
	hashLength := prf.Size()
	blocks := (keyLength + hashLength - 1) / hashLength

	derived := make([]byte, 0, blocks*hashLength)

	var counter [4]byte
	u := make([]byte, hashLength)
	t := make([]byte, hashLength)

	for block := 1; block <= blocks; block++ {
		prf.Reset()
		prf.Write(salt)
		counter[0] = byte(block >> 24)
		counter[1] = byte(block >> 16)
		counter[2] = byte(block >> 8)
		counter[3] = byte(block)
		prf.Write(counter[:])

		u = prf.Sum(u[:0])
		copy(t, u)

		for round := 1; round < iterations; round++ {
			prf.Reset()
			prf.Write(u)
			u = prf.Sum(u[:0])
			for index := range t {
				t[index] ^= u[index]
			}
		}

		derived = append(derived, t...)
	}

	return derived[:keyLength]
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, pbkdf2SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("create password salt: %w", err)
	}

	key := pbkdf2SHA256([]byte(password), salt, pbkdf2Iterations, pbkdf2KeyLength)

	encoded := fmt.Sprintf(
		"%v$%v$%v$%v",
		passwordScheme,
		pbkdf2Iterations,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	)

	return encoded, nil
}

func verifyPassword(encoded string, password string) bool {
	fields := strings.Split(encoded, "$")
	if len(fields) != 4 || fields[0] != passwordScheme {
		return false
	}

	iterations, err := strconv.Atoi(fields[1])
	if err != nil || iterations <= 0 || iterations > 10000000 {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(fields[2])
	if err != nil || len(salt) == 0 {
		return false
	}

	expected, err := base64.RawStdEncoding.DecodeString(fields[3])
	if err != nil || len(expected) == 0 {
		return false
	}

	actual := pbkdf2SHA256([]byte(password), salt, iterations, len(expected))

	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func randomPassword(length int) (string, error) {
	result := make([]byte, length)
	random := make([]byte, length)

	for index := 0; index < length; {
		if _, err := rand.Read(random); err != nil {
			return "", fmt.Errorf("create random password: %w", err)
		}

		for _, value := range random {
			limit := 256 - 256%len(passwordAlphabet)
			if int(value) >= limit {
				continue
			}

			result[index] = passwordAlphabet[int(value)%len(passwordAlphabet)]
			index++

			if index == length {
				break
			}
		}
	}

	return string(result), nil
}

type sessionStore struct {
	mutex    sync.Mutex
	sessions map[string]time.Time
	ttl      time.Duration
}

func newSessionStore(ttl time.Duration) *sessionStore {
	return &sessionStore{
		sessions: make(map[string]time.Time),
		ttl:      ttl,
	}
}

func (store *sessionStore) create() (string, error) {
	token := make([]byte, sessionTokenLength)
	if _, err := rand.Read(token); err != nil {
		return "", fmt.Errorf("create session token: %w", err)
	}

	value := base64.RawURLEncoding.EncodeToString(token)

	store.mutex.Lock()
	defer store.mutex.Unlock()

	now := time.Now()
	for key, expires := range store.sessions {
		if now.After(expires) {
			delete(store.sessions, key)
		}
	}

	store.sessions[value] = now.Add(store.ttl)

	return value, nil
}

func (store *sessionStore) valid(value string) bool {
	if value == "" {
		return false
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	expires, ok := store.sessions[value]
	if !ok {
		return false
	}

	if time.Now().After(expires) {
		delete(store.sessions, value)
		return false
	}

	return true
}

func (store *sessionStore) destroy(value string) {
	store.mutex.Lock()
	defer store.mutex.Unlock()

	delete(store.sessions, value)
}

type loginFailure struct {
	failures int
	blocked  time.Time
}

type loginLimiter struct {
	mutex    sync.Mutex
	failures map[string]*loginFailure
	limit    int
	block    time.Duration
}

func newLoginLimiter(limit int, block time.Duration) *loginLimiter {
	return &loginLimiter{
		failures: make(map[string]*loginFailure),
		limit:    limit,
		block:    block,
	}
}

func (limiter *loginLimiter) allow(key string) bool {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	failure, ok := limiter.failures[key]
	if !ok {
		return true
	}

	return time.Now().After(failure.blocked)
}

func (limiter *loginLimiter) fail(key string) {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	failure, ok := limiter.failures[key]
	if !ok {
		failure = &loginFailure{}
		limiter.failures[key] = failure
	}

	failure.failures++
	if failure.failures >= limiter.limit {
		failure.failures = 0
		failure.blocked = time.Now().Add(limiter.block)
	}
}

func (limiter *loginLimiter) reset(key string) {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	delete(limiter.failures, key)
}
