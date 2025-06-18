import React from 'react'

const Footer = () => {
  return (
    <div>
        <footer className="bg-black text-white text-center p-4 mt-10  relative">
            <p className="text-sm">
            &copy; {new Date().getFullYear()} Secure Vault. All rights reserved.
            </p>
            <p className="text-xs mt-2">
            Made with ❤️ by{" "}
            <a href="https://nihar-chandra-sharma.vercel.app/" target="_blank"  className="hover:underline ">
            <span className="text-purple-500"> Nihar Chandra Sharma </span>
            </a>
            </p>
        </footer>
    </div>
  )
}

export default Footer